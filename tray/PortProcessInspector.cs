using System;
using System.Diagnostics;
using System.Management;

namespace CodexTokenDesk
{
    internal sealed class PortProcessInspector
    {
        public int FindListeningProcessId(int port)
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo();
                info.FileName = "netstat.exe";
                info.Arguments = "-ano -p tcp";
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.RedirectStandardOutput = true;
                using (Process process = Process.Start(info))
                {
                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit(4000);
                    string suffix = ":" + port;
                    string[] lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (string line in lines)
                    {
                        string[] parts = line.Trim().Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 5 &&
                            parts[1].EndsWith(suffix, StringComparison.Ordinal) &&
                            string.Equals(parts[3], "LISTENING", StringComparison.OrdinalIgnoreCase))
                        {
                            int pid;
                            if (int.TryParse(parts[4], out pid)) return pid;
                        }
                    }
                }
            }
            catch
            {
                return -1;
            }
            return -1;
        }

        public bool MatchesStartTime(int processId, long expectedUtcTicks)
        {
            if (processId <= 0 || expectedUtcTicks <= 0) return false;
            try
            {
                using (Process process = Process.GetProcessById(processId))
                {
                    return process.StartTime.ToUniversalTime().Ticks == expectedUtcTicks;
                }
            }
            catch
            {
                return false;
            }
        }

        public bool IsExpectedServerChain(int listenerProcessId, int launcherProcessId, string repositoryRoot)
        {
            ProcessSnapshot listener = ReadProcess(listenerProcessId);
            if (listener == null || !string.Equals(listener.Name, "node.exe", StringComparison.OrdinalIgnoreCase)) return false;
            if (!ContainsPath(listener.CommandLine, repositoryRoot) || listener.CommandLine.IndexOf("next", StringComparison.OrdinalIgnoreCase) < 0) return false;

            int currentProcessId = listener.ParentProcessId;
            for (int depth = 0; depth < 16 && currentProcessId > 0; depth++)
            {
                ProcessSnapshot current = ReadProcess(currentProcessId);
                if (current == null) return false;
                if (current.ProcessId == launcherProcessId)
                {
                    return string.Equals(current.Name, "powershell.exe", StringComparison.OrdinalIgnoreCase) &&
                        ContainsPath(current.CommandLine, repositoryRoot) &&
                        current.CommandLine.IndexOf("start-dashboard.ps1", StringComparison.OrdinalIgnoreCase) >= 0;
                }
                currentProcessId = current.ParentProcessId;
            }
            return false;
        }

        private static bool ContainsPath(string commandLine, string path)
        {
            return !string.IsNullOrEmpty(commandLine) &&
                !string.IsNullOrEmpty(path) &&
                commandLine.IndexOf(path.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static ProcessSnapshot ReadProcess(int processId)
        {
            try
            {
                using (ManagementObjectSearcher searcher = new ManagementObjectSearcher(
                    "SELECT ProcessId, ParentProcessId, Name, CommandLine FROM Win32_Process WHERE ProcessId = " + processId))
                using (ManagementObjectCollection results = searcher.Get())
                {
                    foreach (ManagementObject result in results)
                    {
                        return new ProcessSnapshot
                        {
                            ProcessId = Convert.ToInt32(result["ProcessId"]),
                            ParentProcessId = Convert.ToInt32(result["ParentProcessId"]),
                            Name = Convert.ToString(result["Name"]),
                            CommandLine = Convert.ToString(result["CommandLine"])
                        };
                    }
                }
            }
            catch
            {
                return null;
            }
            return null;
        }

        private sealed class ProcessSnapshot
        {
            public int ProcessId { get; set; }
            public int ParentProcessId { get; set; }
            public string Name { get; set; }
            public string CommandLine { get; set; }
        }
    }
}
