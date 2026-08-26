using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace CodexTokenDesk
{
    internal sealed class JobProcess : IDisposable
    {
        private const uint CreateSuspended = 0x00000004;
        private const uint CreateNoWindow = 0x08000000;
        private const uint CreateUnicodeEnvironment = 0x00000400;
        private const uint JobObjectLimitKillOnJobClose = 0x00002000;
        private const int JobObjectExtendedLimitInformation = 9;

        private IntPtr jobHandle;
        private Process rootProcess;

        private JobProcess(IntPtr job, Process process)
        {
            jobHandle = job;
            rootProcess = process;
        }

        public int ProcessId
        {
            get { return rootProcess == null ? 0 : rootProcess.Id; }
        }

        public bool HasExited
        {
            get { return rootProcess == null || rootProcess.HasExited; }
        }

        public long StartTimeUtcTicks
        {
            get { return rootProcess.StartTime.ToUniversalTime().Ticks; }
        }

        public int? ExitCode
        {
            get
            {
                if (rootProcess == null || !rootProcess.HasExited) return null;
                try { return rootProcess.ExitCode; }
                catch { return null; }
            }
        }

        public static JobProcess Start(string executable, string arguments, string workingDirectory, IDictionary<string, string> environmentOverrides)
        {
            IntPtr job = NativeMethods.CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) throw CreateWin32Exception("无法创建服务 Job Object");

            NativeMethods.ProcessInformation processInformation = new NativeMethods.ProcessInformation();
            bool processCreated = false;
            IntPtr environment = IntPtr.Zero;
            try
            {
                NativeMethods.JobObjectExtendedLimitInformation limits = new NativeMethods.JobObjectExtendedLimitInformation();
                limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
                int length = Marshal.SizeOf(typeof(NativeMethods.JobObjectExtendedLimitInformation));
                IntPtr limitsPointer = Marshal.AllocHGlobal(length);
                try
                {
                    Marshal.StructureToPtr(limits, limitsPointer, false);
                    if (!NativeMethods.SetInformationJobObject(job, JobObjectExtendedLimitInformation, limitsPointer, (uint)length))
                    {
                        throw CreateWin32Exception("无法配置服务 Job Object");
                    }
                }
                finally
                {
                    Marshal.FreeHGlobal(limitsPointer);
                }

                NativeMethods.StartupInfo startupInfo = new NativeMethods.StartupInfo();
                startupInfo.Size = Marshal.SizeOf(typeof(NativeMethods.StartupInfo));
                StringBuilder commandLine = new StringBuilder(Quote(executable) + " " + arguments);
                environment = CreateEnvironmentBlock(environmentOverrides);
                processCreated = NativeMethods.CreateProcess(
                    executable,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    CreateSuspended | CreateNoWindow | CreateUnicodeEnvironment,
                    environment,
                    workingDirectory,
                    ref startupInfo,
                    out processInformation);
                if (!processCreated) throw CreateWin32Exception("无法启动服务进程");

                if (!NativeMethods.AssignProcessToJobObject(job, processInformation.ProcessHandle))
                {
                    throw CreateWin32Exception("无法把服务进程加入 Job Object");
                }
                if (NativeMethods.ResumeThread(processInformation.ThreadHandle) == uint.MaxValue)
                {
                    throw CreateWin32Exception("无法恢复服务进程");
                }

                Process process = Process.GetProcessById((int)processInformation.ProcessId);
                LifecycleLog.Write("job.started", "launcherPid=" + process.Id);
                return new JobProcess(job, process);
            }
            catch
            {
                if (processCreated && processInformation.ProcessHandle != IntPtr.Zero)
                {
                    NativeMethods.TerminateProcess(processInformation.ProcessHandle, 1);
                }
                NativeMethods.CloseHandle(job);
                throw;
            }
            finally
            {
                if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
                if (processInformation.ThreadHandle != IntPtr.Zero) NativeMethods.CloseHandle(processInformation.ThreadHandle);
                if (processInformation.ProcessHandle != IntPtr.Zero) NativeMethods.CloseHandle(processInformation.ProcessHandle);
            }
        }

        private static IntPtr CreateEnvironmentBlock(IDictionary<string, string> overrides)
        {
            SortedDictionary<string, string> variables = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables())
            {
                variables[(string)entry.Key] = entry.Value == null ? string.Empty : entry.Value.ToString();
            }
            if (overrides != null)
            {
                foreach (KeyValuePair<string, string> entry in overrides)
                {
                    variables[entry.Key] = entry.Value ?? string.Empty;
                }
            }

            StringBuilder block = new StringBuilder();
            foreach (KeyValuePair<string, string> variable in variables)
            {
                block.Append(variable.Key).Append('=').Append(variable.Value).Append('\0');
            }
            block.Append('\0');
            return Marshal.StringToHGlobalUni(block.ToString());
        }

        public void Terminate()
        {
            if (jobHandle == IntPtr.Zero) return;
            if (!NativeMethods.TerminateJobObject(jobHandle, 0))
            {
                int error = Marshal.GetLastWin32Error();
                if (error != 6) throw new Win32Exception(error, "无法终止服务 Job Object。");
            }
            LifecycleLog.Write("job.terminated", "launcherPid=" + ProcessId);
        }

        public void Dispose()
        {
            if (rootProcess != null)
            {
                rootProcess.Dispose();
                rootProcess = null;
            }
            if (jobHandle != IntPtr.Zero)
            {
                NativeMethods.CloseHandle(jobHandle);
                jobHandle = IntPtr.Zero;
            }
        }

        private static Win32Exception CreateWin32Exception(string message)
        {
            return new Win32Exception(Marshal.GetLastWin32Error(), message);
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private static class NativeMethods
        {
            [StructLayout(LayoutKind.Sequential)]
            internal struct IoCounters
            {
                internal ulong ReadOperationCount;
                internal ulong WriteOperationCount;
                internal ulong OtherOperationCount;
                internal ulong ReadTransferCount;
                internal ulong WriteTransferCount;
                internal ulong OtherTransferCount;
            }

            [StructLayout(LayoutKind.Sequential)]
            internal struct JobObjectBasicLimitInformation
            {
                internal long PerProcessUserTimeLimit;
                internal long PerJobUserTimeLimit;
                internal uint LimitFlags;
                internal UIntPtr MinimumWorkingSetSize;
                internal UIntPtr MaximumWorkingSetSize;
                internal uint ActiveProcessLimit;
                internal UIntPtr Affinity;
                internal uint PriorityClass;
                internal uint SchedulingClass;
            }

            [StructLayout(LayoutKind.Sequential)]
            internal struct JobObjectExtendedLimitInformation
            {
                internal JobObjectBasicLimitInformation BasicLimitInformation;
                internal IoCounters IoInfo;
                internal UIntPtr ProcessMemoryLimit;
                internal UIntPtr JobMemoryLimit;
                internal UIntPtr PeakProcessMemoryUsed;
                internal UIntPtr PeakJobMemoryUsed;
            }

            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
            internal struct StartupInfo
            {
                internal int Size;
                internal string Reserved;
                internal string Desktop;
                internal string Title;
                internal uint X;
                internal uint Y;
                internal uint XSize;
                internal uint YSize;
                internal uint XCountChars;
                internal uint YCountChars;
                internal uint FillAttribute;
                internal uint Flags;
                internal short ShowWindow;
                internal short Reserved2;
                internal IntPtr Reserved2Pointer;
                internal IntPtr StandardInput;
                internal IntPtr StandardOutput;
                internal IntPtr StandardError;
            }

            [StructLayout(LayoutKind.Sequential)]
            internal struct ProcessInformation
            {
                internal IntPtr ProcessHandle;
                internal IntPtr ThreadHandle;
                internal uint ProcessId;
                internal uint ThreadId;
            }

            [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
            internal static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

            [DllImport("kernel32.dll", SetLastError = true)]
            [return: MarshalAs(UnmanagedType.Bool)]
            internal static extern bool SetInformationJobObject(IntPtr job, int informationClass, IntPtr information, uint informationLength);

            [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
            [return: MarshalAs(UnmanagedType.Bool)]
            internal static extern bool CreateProcess(
                string applicationName,
                StringBuilder commandLine,
                IntPtr processAttributes,
                IntPtr threadAttributes,
                [MarshalAs(UnmanagedType.Bool)] bool inheritHandles,
                uint creationFlags,
                IntPtr environment,
                string currentDirectory,
                ref StartupInfo startupInfo,
                out ProcessInformation processInformation);

            [DllImport("kernel32.dll", SetLastError = true)]
            [return: MarshalAs(UnmanagedType.Bool)]
            internal static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

            [DllImport("kernel32.dll", SetLastError = true)]
            internal static extern uint ResumeThread(IntPtr thread);

            [DllImport("kernel32.dll", SetLastError = true)]
            [return: MarshalAs(UnmanagedType.Bool)]
            internal static extern bool TerminateJobObject(IntPtr job, uint exitCode);

            [DllImport("kernel32.dll", SetLastError = true)]
            [return: MarshalAs(UnmanagedType.Bool)]
            internal static extern bool TerminateProcess(IntPtr process, uint exitCode);

            [DllImport("kernel32.dll", SetLastError = true)]
            [return: MarshalAs(UnmanagedType.Bool)]
            internal static extern bool CloseHandle(IntPtr handle);
        }
    }
}
