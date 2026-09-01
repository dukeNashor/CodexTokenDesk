using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Threading;

namespace CodexTokenDesk
{
    internal sealed class ServerController : IDisposable
    {
        internal const string DashboardAddress = "127.0.0.1:3002";
        private const int DashboardPort = 3002;
        private const string DashboardUrl = "http://" + DashboardAddress + "/";
        private readonly string repositoryRoot;
        private readonly ServerInstanceStore instanceStore;
        private readonly PortProcessInspector processInspector;
        private JobProcess launcher;
        private string instanceId;
        private bool serviceWasRunning;

        public ServerController()
        {
            repositoryRoot = FindRepositoryRoot();
            instanceStore = new ServerInstanceStore();
            processInspector = new PortProcessInspector();
        }

        public bool IsDashboardRunning()
        {
            if (launcher == null || string.IsNullOrEmpty(instanceId) || launcher.HasExited) return false;
            return string.Equals(ReadHealthInstanceId(), instanceId, StringComparison.Ordinal);
        }

        private string ReadHealthInstanceId()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(DashboardUrl + "api/health?instance=" + Guid.NewGuid().ToString("N"));
                request.Method = "GET";
                request.Timeout = 1300;
                request.ReadWriteTimeout = 1300;
                request.Proxy = null;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (Stream stream = response.GetResponseStream())
                {
                    if (response.StatusCode != HttpStatusCode.OK) return null;
                    DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(HealthResponse));
                    HealthResponse health = (HealthResponse)serializer.ReadObject(stream);
                    if (health == null || !health.Ok || !string.Equals(health.Service, "Codex Token Desk", StringComparison.Ordinal)) return null;
                    return health.InstanceId;
                }
            }
            catch
            {
                return null;
            }
        }

        public void StartAndWait()
        {
            if (IsDashboardRunning()) return;
            if (repositoryRoot == null) throw new InvalidOperationException("找不到 Codex Token Desk 运行时目录。请从完整的 standalone 发布目录启动 EXE。");

            int existingListenerPid = processInspector.FindListeningProcessId(DashboardPort);
            if (existingListenerPid > 0)
            {
                ServerInstanceRecord existingRecord = instanceStore.Read();
                if (!IsVerifiedOwnedInstance(existingRecord, existingListenerPid))
                {
                    throw new InvalidOperationException("端口 " + DashboardPort + " 已被未知程序占用。为避免误杀进程，Codex Token Desk 已拒绝启动。");
                }
                StopVerifiedOwnedInstance(existingRecord);
            }

            string standaloneServer = Path.Combine(repositoryRoot, ".next", "standalone", "server.js");
            string bundledNode = Path.Combine(repositoryRoot, "runtime", "node", "node.exe");
            string executable;
            string arguments;
            if (File.Exists(standaloneServer) && File.Exists(bundledNode))
            {
                executable = bundledNode;
                arguments = Quote(standaloneServer);
            }
            else
            {
                string buildMarker = Path.Combine(repositoryRoot, ".next", "BUILD_ID");
                if (!File.Exists(buildMarker)) throw new InvalidOperationException("缺少 standalone 生产构建。请重新生成完整发布包。");

                string script = Path.Combine(repositoryRoot, "scripts", "start-dashboard.ps1");
                string powershell = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
                executable = powershell;
                arguments = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(script) + " -Production";
            }
            instanceId = Guid.NewGuid().ToString("N");
            Dictionary<string, string> environment = new Dictionary<string, string>();
            environment["CODEX_TOKEN_DESK_INSTANCE_ID"] = instanceId;
            environment["HOSTNAME"] = "127.0.0.1";
            environment["PORT"] = DashboardPort.ToString();
            try
            {
                launcher = JobProcess.Start(executable, arguments, repositoryRoot, environment);
                WriteInstanceRecord(0, 0);

                for (int attempt = 0; attempt < 50; attempt++)
                {
                    Thread.Sleep(400);
                    if (IsDashboardRunning())
                    {
                        int listenerPid = processInspector.FindListeningProcessId(DashboardPort);
                        if (listenerPid <= 0) throw new InvalidOperationException("Dashboard 已响应，但找不到端口监听进程。");
                        Process listener = Process.GetProcessById(listenerPid);
                        try
                        {
                            WriteInstanceRecord(listenerPid, listener.StartTime.ToUniversalTime().Ticks);
                        }
                        finally
                        {
                            listener.Dispose();
                        }
                        serviceWasRunning = true;
                        LifecycleLog.Write("service.started", "instanceId=" + instanceId + " listenerPid=" + listenerPid);
                        return;
                    }
                    if (launcher != null && launcher.HasExited) throw new InvalidOperationException("启动进程提前退出。请检查 standalone 运行时是否完整。");
                }
                throw new TimeoutException("Dashboard 在 20 秒内未能启动。");
            }
            catch
            {
                serviceWasRunning = false;
                StopLauncher();
                instanceStore.DeleteIfMatches(instanceId);
                instanceId = null;
                throw;
            }
        }

        public void StopAndWait()
        {
            serviceWasRunning = false;
            string stoppedInstanceId = instanceId;
            if (launcher == null)
            {
                int existingListenerPid = processInspector.FindListeningProcessId(DashboardPort);
                if (existingListenerPid <= 0) return;
                ServerInstanceRecord existingRecord = instanceStore.Read();
                if (!IsVerifiedOwnedInstance(existingRecord, existingListenerPid))
                {
                    throw new InvalidOperationException("端口 " + DashboardPort + " 由未知程序占用，未执行停止操作。");
                }
                StopVerifiedOwnedInstance(existingRecord);
                return;
            }
            StopLauncher();
            for (int attempt = 0; attempt < 20; attempt++)
            {
                if (processInspector.FindListeningProcessId(DashboardPort) <= 0)
                {
                    instanceStore.DeleteIfMatches(stoppedInstanceId);
                    LifecycleLog.Write("service.stopped", "instanceId=" + stoppedInstanceId);
                    instanceId = null;
                    return;
                }
                Thread.Sleep(250);
            }
            throw new InvalidOperationException("端口 " + DashboardPort + " 仍在监听，服务未完全停止。");
        }

        public bool HasUnexpectedExit()
        {
            return serviceWasRunning && launcher != null && launcher.HasExited;
        }

        public void CleanupUnexpectedExit()
        {
            if (!HasUnexpectedExit()) return;
            string stoppedInstanceId = instanceId;
            serviceWasRunning = false;
            int? exitCode = launcher.ExitCode;
            LifecycleLog.Write(
                "service.unexpected-exit",
                "instanceId=" + stoppedInstanceId + " launcherPid=" + launcher.ProcessId + " exitCode=" + (exitCode.HasValue ? exitCode.Value.ToString() : "unknown"));
            StopLauncher();
            for (int attempt = 0; attempt < 20; attempt++)
            {
                if (processInspector.FindListeningProcessId(DashboardPort) <= 0)
                {
                    instanceStore.DeleteIfMatches(stoppedInstanceId);
                    instanceId = null;
                    return;
                }
                Thread.Sleep(250);
            }
            throw new InvalidOperationException("异常退出的服务进程树仍占用端口 " + DashboardPort + "。");
        }

        private bool IsVerifiedOwnedInstance(ServerInstanceRecord record, int listenerProcessId)
        {
            if (record == null) return OwnershipMismatch("state file missing or invalid");
            if (record.Version != 1) return OwnershipMismatch("state version mismatch");
            if (record.Port != DashboardPort || record.ListenerProcessId != listenerProcessId) return OwnershipMismatch("port or listener PID mismatch");
            if (string.IsNullOrEmpty(record.InstanceId)) return OwnershipMismatch("instanceId missing");
            if (!PathsEqual(record.RepositoryRoot, repositoryRoot)) return OwnershipMismatch("repository root mismatch");
            if (!string.Equals(ReadHealthInstanceId(), record.InstanceId, StringComparison.Ordinal)) return OwnershipMismatch("health instanceId mismatch");
            if (!processInspector.MatchesStartTime(record.ListenerProcessId, record.ListenerStartTimeUtcTicks)) return OwnershipMismatch("listener start time mismatch");
            if (!processInspector.MatchesStartTime(record.LauncherProcessId, record.LauncherStartTimeUtcTicks)) return OwnershipMismatch("launcher start time mismatch");
            if (!processInspector.IsExpectedServerChain(record.ListenerProcessId, record.LauncherProcessId, repositoryRoot)) return OwnershipMismatch("process chain mismatch");
            LifecycleLog.Write("ownership.verified", "listenerPid=" + listenerProcessId + " launcherPid=" + record.LauncherProcessId);
            return true;
        }

        private static bool OwnershipMismatch(string reason)
        {
            LifecycleLog.Write("ownership.rejected", reason);
            return false;
        }

        private static bool PathsEqual(string left, string right)
        {
            if (string.IsNullOrEmpty(left) || string.IsNullOrEmpty(right)) return false;
            try
            {
                return string.Equals(
                    Path.GetFullPath(left).TrimEnd('\\'),
                    Path.GetFullPath(right).TrimEnd('\\'),
                    StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private void StopVerifiedOwnedInstance(ServerInstanceRecord record)
        {
            KillProcess(record.ListenerProcessId);
            KillProcess(record.LauncherProcessId);
            for (int attempt = 0; attempt < 20; attempt++)
            {
                if (processInspector.FindListeningProcessId(DashboardPort) <= 0)
                {
                    instanceStore.DeleteIfMatches(record.InstanceId);
                    return;
                }
                Thread.Sleep(250);
            }
            throw new InvalidOperationException("已验证的 Codex Token Desk 孤儿进程未能释放端口 " + DashboardPort + "。");
        }

        private static void KillProcess(int processId)
        {
            if (processId <= 0) return;
            try
            {
                using (Process process = Process.GetProcessById(processId))
                {
                    process.Kill();
                    process.WaitForExit(5000);
                }
            }
            catch (ArgumentException)
            {
                // Process already exited.
            }
        }

        private void WriteInstanceRecord(int listenerProcessId, long listenerStartTimeUtcTicks)
        {
            instanceStore.Write(new ServerInstanceRecord
            {
                Version = 1,
                InstanceId = instanceId,
                Port = DashboardPort,
                RepositoryRoot = repositoryRoot,
                LauncherProcessId = launcher.ProcessId,
                LauncherStartTimeUtcTicks = launcher.StartTimeUtcTicks,
                ListenerProcessId = listenerProcessId,
                ListenerStartTimeUtcTicks = listenerStartTimeUtcTicks
            });
        }

        private void StopLauncher()
        {
            if (launcher == null) return;
            try
            {
                launcher.Terminate();
            }
            catch
            {
                // Child server process is the authoritative lifecycle signal.
            }
            finally
            {
                launcher.Dispose();
                launcher = null;
            }
        }

        private static string FindRepositoryRoot()
        {
            string[] starts = { AppDomain.CurrentDomain.BaseDirectory, Environment.CurrentDirectory };
            foreach (string start in starts)
            {
                DirectoryInfo directory = new DirectoryInfo(start);
                for (int level = 0; level < 8 && directory != null; level++, directory = directory.Parent)
                {
                    if (File.Exists(Path.Combine(directory.FullName, ".next", "standalone", "server.js")) &&
                        File.Exists(Path.Combine(directory.FullName, "runtime", "node", "node.exe"))) return directory.FullName;
                    if (File.Exists(Path.Combine(directory.FullName, "package.json")) && File.Exists(Path.Combine(directory.FullName, "scripts", "start-dashboard.ps1"))) return directory.FullName;
                }
            }
            return null;
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        public static void OpenDashboard()
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(DashboardUrl);
                info.UseShellExecute = true;
                Process.Start(info);
            }
            catch
            {
                // Opening a browser is a convenience and must not crash the tray app.
            }
        }

        public void Dispose()
        {
            if (launcher != null)
            {
                launcher.Dispose();
                launcher = null;
            }
        }

        [DataContract]
        private sealed class HealthResponse
        {
            [DataMember(Name = "ok")]
            public bool Ok { get; set; }

            [DataMember(Name = "service")]
            public string Service { get; set; }

            [DataMember(Name = "instanceId")]
            public string InstanceId { get; set; }
        }
    }
}
