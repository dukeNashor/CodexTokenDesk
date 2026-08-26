using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Codex Token Desk")]
[assembly: AssemblyDescription("Tray controller for the local Codex Token dashboard")]
[assembly: AssemblyProduct("Codex Token Desk")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace CodexTokenDesk
{
    internal static class Program
    {
        private const string MutexName = @"Local\CodexTokenDesk.Tray";
        private const string ExitEventName = @"Local\CodexTokenDesk.Tray.Exit";

        [STAThread]
        private static void Main(string[] args)
        {
            if (args.Length > 0 && HandleCommand(args[0])) return;

            bool createdNew;
            using (Mutex mutex = new Mutex(true, MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    ServerController.OpenDashboard();
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                bool eventCreated;
                using (EventWaitHandle exitEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ExitEventName, out eventCreated))
                {
                    Application.Run(new TrayApplicationContext(exitEvent));
                }
            }
        }

        private static bool HandleCommand(string command)
        {
            string value = command.ToLowerInvariant();
            if (value == "--open")
            {
                ServerController.OpenDashboard();
                return true;
            }

            if (value == "--exit")
            {
                try
                {
                    using (EventWaitHandle exitEvent = EventWaitHandle.OpenExisting(ExitEventName))
                    {
                        exitEvent.Set();
                        return true;
                    }
                }
                catch (WaitHandleCannotBeOpenedException)
                {
                    using (ServerController controller = new ServerController()) controller.StopAndWait();
                    return true;
                }
            }

            if (value != "--start" && value != "--stop" && value != "--restart") return false;
            try
            {
                using (ServerController controller = new ServerController())
                {
                    if (value == "--stop") controller.StopAndWait();
                    else if (value == "--start") controller.StartAndWait();
                    else
                    {
                        controller.StopAndWait();
                        controller.StartAndWait();
                    }
                }
            }
            catch (Exception ex)
            {
                Environment.ExitCode = 1;
                MessageBox.Show(ex.Message, "Codex Token Desk", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            return true;
        }
    }

    internal enum ServiceState
    {
        Stopped,
        Starting,
        Running,
        Stopping,
        Faulted
    }

    internal sealed class TrayApplicationContext : ApplicationContext
    {
        private readonly ServerController controller;
        private readonly EventWaitHandle exitEvent;
        private readonly NotifyIcon notifyIcon;
        private readonly ToolStripMenuItem statusItem;
        private readonly ToolStripMenuItem startItem;
        private readonly ToolStripMenuItem stopItem;
        private readonly ToolStripMenuItem restartItem;
        private readonly ToolStripMenuItem startupItem;
        private readonly System.Windows.Forms.Timer timer;
        private Icon currentIcon;
        private ServiceState state;
        private bool operationInProgress;
        private bool firstIdleHandled;
        private bool exiting;

        public TrayApplicationContext(EventWaitHandle exitEventHandle)
        {
            exitEvent = exitEventHandle;
            controller = new ServerController();
            state = controller.IsDashboardRunning() ? ServiceState.Running : ServiceState.Stopped;

            ContextMenuStrip menu = new ContextMenuStrip();
            statusItem = new ToolStripMenuItem();
            statusItem.Enabled = false;

            ToolStripMenuItem openItem = new ToolStripMenuItem("打开 Dashboard");
            openItem.Font = new Font(openItem.Font, FontStyle.Bold);
            openItem.Click += delegate { ServerController.OpenDashboard(); };

            startItem = new ToolStripMenuItem("启动服务");
            startItem.Click += async delegate { await StartServiceAsync(true); };

            stopItem = new ToolStripMenuItem("停止服务");
            stopItem.Click += async delegate { await StopServiceAsync(true); };

            restartItem = new ToolStripMenuItem("重启服务");
            restartItem.Click += async delegate { await RestartServiceAsync(); };

            startupItem = new ToolStripMenuItem("随 Windows 启动");
            startupItem.CheckOnClick = true;
            startupItem.Checked = StartupRegistration.IsEnabled();
            startupItem.Click += delegate
            {
                try
                {
                    StartupRegistration.SetEnabled(startupItem.Checked);
                }
                catch (Exception ex)
                {
                    startupItem.Checked = !startupItem.Checked;
                    ShowError("无法修改开机启动设置", ex.Message);
                }
            };

            ToolStripMenuItem exitItem = new ToolStripMenuItem("退出（同时停止服务）");
            exitItem.Click += async delegate { await ExitAsync(); };

            menu.Items.Add(statusItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(openItem);
            menu.Items.Add(startItem);
            menu.Items.Add(stopItem);
            menu.Items.Add(restartItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(startupItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(exitItem);

            notifyIcon = new NotifyIcon();
            notifyIcon.ContextMenuStrip = menu;
            notifyIcon.Text = "Codex Token Desk";
            notifyIcon.DoubleClick += delegate { ServerController.OpenDashboard(); };
            notifyIcon.Visible = true;

            timer = new System.Windows.Forms.Timer();
            timer.Interval = 5000;
            timer.Tick += async delegate
            {
                if (exitEvent.WaitOne(0)) await ExitAsync();
                else RefreshObservedState();
            };
            timer.Start();

            ApplyState(state);
            Application.Idle += HandleFirstIdle;
        }

        private async void HandleFirstIdle(object sender, EventArgs e)
        {
            if (firstIdleHandled) return;
            firstIdleHandled = true;
            Application.Idle -= HandleFirstIdle;
            if (state == ServiceState.Stopped) await StartServiceAsync(false);
        }

        private async Task StartServiceAsync(bool openWhenReady)
        {
            if (operationInProgress || controller.IsDashboardRunning())
            {
                ApplyState(ServiceState.Running);
                if (openWhenReady) ServerController.OpenDashboard();
                return;
            }

            operationInProgress = true;
            ApplyState(ServiceState.Starting);
            try
            {
                await Task.Run(delegate { controller.StartAndWait(); });
                ApplyState(ServiceState.Running);
                if (openWhenReady) ServerController.OpenDashboard();
                ShowInfo("服务已启动", "Dashboard 正在 " + ServerController.DashboardAddress + " 运行。");
            }
            catch (Exception ex)
            {
                ApplyState(ServiceState.Faulted);
                ShowError("服务启动失败", ex.Message);
            }
            finally
            {
                operationInProgress = false;
            }
        }

        private async Task StopServiceAsync(bool notify)
        {
            if (operationInProgress) return;
            operationInProgress = true;
            ApplyState(ServiceState.Stopping);
            try
            {
                await Task.Run(delegate { controller.StopAndWait(); });
                ApplyState(ServiceState.Stopped);
                if (notify) ShowInfo("服务已停止", "本地 Dashboard 已关闭。");
            }
            catch (Exception ex)
            {
                ApplyState(ServiceState.Faulted);
                ShowError("服务停止失败", ex.Message);
            }
            finally
            {
                operationInProgress = false;
            }
        }

        private async Task RestartServiceAsync()
        {
            if (operationInProgress) return;
            operationInProgress = true;
            ApplyState(ServiceState.Stopping);
            try
            {
                await Task.Run(delegate { controller.StopAndWait(); });
                ApplyState(ServiceState.Starting);
                await Task.Run(delegate { controller.StartAndWait(); });
                ApplyState(ServiceState.Running);
                ShowInfo("服务已重启", "Dashboard 已重新接通本机 Codex rollout。");
            }
            catch (Exception ex)
            {
                ApplyState(ServiceState.Faulted);
                ShowError("服务重启失败", ex.Message);
            }
            finally
            {
                operationInProgress = false;
            }
        }

        private async Task ExitAsync()
        {
            if (exiting) return;
            exiting = true;
            timer.Stop();
            ApplyState(ServiceState.Stopping);
            try
            {
                await Task.Run(delegate { controller.StopAndWait(); });
            }
            catch
            {
                // Exit should not be blocked by a failed cleanup attempt.
            }
            notifyIcon.Visible = false;
            ExitThread();
        }

        private void RefreshObservedState()
        {
            if (operationInProgress || exiting) return;
            ApplyState(controller.IsDashboardRunning() ? ServiceState.Running : ServiceState.Stopped);
        }

        private void ApplyState(ServiceState nextState)
        {
            state = nextState;
            string label;
            Color color;
            switch (state)
            {
                case ServiceState.Running:
                    label = "状态：运行中 · " + ServerController.DashboardAddress;
                    color = Color.FromArgb(98, 207, 144);
                    break;
                case ServiceState.Starting:
                    label = "状态：正在启动…";
                    color = Color.FromArgb(90, 181, 231);
                    break;
                case ServiceState.Stopping:
                    label = "状态：正在停止…";
                    color = Color.FromArgb(230, 182, 78);
                    break;
                case ServiceState.Faulted:
                    label = "状态：启动异常";
                    color = Color.FromArgb(238, 103, 94);
                    break;
                default:
                    label = "状态：已停止";
                    color = Color.FromArgb(105, 115, 114);
                    break;
            }

            statusItem.Text = label;
            startItem.Enabled = !operationInProgress && state != ServiceState.Running;
            stopItem.Enabled = !operationInProgress && state == ServiceState.Running;
            restartItem.Enabled = !operationInProgress && state == ServiceState.Running;
            notifyIcon.Text = state == ServiceState.Running ? "Codex Token Desk - 运行中" : "Codex Token Desk - 已停止";

            Icon nextIcon = TrayIconFactory.Create(color);
            notifyIcon.Icon = nextIcon;
            if (currentIcon != null) currentIcon.Dispose();
            currentIcon = nextIcon;
        }

        private void ShowInfo(string title, string message)
        {
            notifyIcon.BalloonTipIcon = ToolTipIcon.Info;
            notifyIcon.BalloonTipTitle = title;
            notifyIcon.BalloonTipText = message;
            notifyIcon.ShowBalloonTip(2500);
        }

        private void ShowError(string title, string message)
        {
            notifyIcon.BalloonTipIcon = ToolTipIcon.Error;
            notifyIcon.BalloonTipTitle = title;
            notifyIcon.BalloonTipText = message;
            notifyIcon.ShowBalloonTip(5000);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                timer.Dispose();
                notifyIcon.Dispose();
                if (currentIcon != null) currentIcon.Dispose();
                controller.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    internal sealed class ServerController : IDisposable
    {
        internal const string DashboardAddress = "127.0.0.1:3002";
        private const int DashboardPort = 3002;
        private const string DashboardUrl = "http://" + DashboardAddress + "/";
        private readonly string repositoryRoot;
        private Process launcher;

        public ServerController()
        {
            repositoryRoot = FindRepositoryRoot();
        }

        public bool IsDashboardRunning()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(DashboardUrl);
                request.Method = "GET";
                request.Timeout = 1300;
                request.ReadWriteTimeout = 1300;
                request.Proxy = null;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                {
                    string html = reader.ReadToEnd();
                    return response.StatusCode == HttpStatusCode.OK && html.IndexOf("Codex Token Desk", StringComparison.OrdinalIgnoreCase) >= 0;
                }
            }
            catch
            {
                return false;
            }
        }

        public void StartAndWait()
        {
            if (IsDashboardRunning()) return;
            if (repositoryRoot == null) throw new InvalidOperationException("找不到 CodexTokenDesk 项目目录。请把 EXE 保留在项目的 dist\\CodexTokenDesk 目录中。");

            string buildMarker = Path.Combine(repositoryRoot, ".next", "BUILD_ID");
            if (!File.Exists(buildMarker)) throw new InvalidOperationException("缺少生产构建。请先在项目目录执行 pnpm build。");

            string script = Path.Combine(repositoryRoot, "scripts", "start-dashboard.ps1");
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = "powershell.exe";
            startInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(script) + " -Production";
            startInfo.WorkingDirectory = repositoryRoot;
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;
            launcher = Process.Start(startInfo);

            for (int attempt = 0; attempt < 50; attempt++)
            {
                Thread.Sleep(400);
                if (IsDashboardRunning()) return;
                if (launcher != null && launcher.HasExited) throw new InvalidOperationException("启动进程提前退出。请检查 Node/pnpm 运行时是否可用。");
            }
            throw new TimeoutException("Dashboard 在 20 秒内未能启动。");
        }

        public void StopAndWait()
        {
            if (!IsDashboardRunning())
            {
                StopLauncher();
                return;
            }

            int pid = FindListeningPid(DashboardPort);
            if (pid > 0)
            {
                try
                {
                    Process process = Process.GetProcessById(pid);
                    process.Kill();
                    process.WaitForExit(5000);
                }
                catch (ArgumentException)
                {
                    // Process already exited.
                }
            }

            StopLauncher();
            for (int attempt = 0; attempt < 20; attempt++)
            {
                if (!IsDashboardRunning()) return;
                Thread.Sleep(250);
            }
            throw new InvalidOperationException("端口 " + DashboardPort + " 仍在监听，服务未完全停止。");
        }

        private void StopLauncher()
        {
            if (launcher == null) return;
            try
            {
                if (!launcher.HasExited) launcher.Kill();
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

        private static int FindListeningPid(int port)
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
                        if (parts.Length >= 5 && parts[1].EndsWith(suffix, StringComparison.Ordinal) && string.Equals(parts[3], "LISTENING", StringComparison.OrdinalIgnoreCase))
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

        private static string FindRepositoryRoot()
        {
            string[] starts = { AppDomain.CurrentDomain.BaseDirectory, Environment.CurrentDirectory };
            foreach (string start in starts)
            {
                DirectoryInfo directory = new DirectoryInfo(start);
                for (int level = 0; level < 8 && directory != null; level++, directory = directory.Parent)
                {
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
            if (launcher != null) launcher.Dispose();
        }
    }

    internal static class StartupRegistration
    {
        private const string KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string ValueName = "CodexTokenDesk";

        public static bool IsEnabled()
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(KeyPath, false))
            {
                return key != null && key.GetValue(ValueName) != null;
            }
        }

        public static void SetEnabled(bool enabled)
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(KeyPath, true))
            {
                if (key == null) throw new InvalidOperationException("无法打开当前用户的启动项注册表。");
                if (enabled)
                {
                    string executable = Process.GetCurrentProcess().MainModule.FileName;
                    key.SetValue(ValueName, "\"" + executable + "\"");
                }
                else
                {
                    key.DeleteValue(ValueName, false);
                }
            }
        }
    }

    internal static class TrayIconFactory
    {
        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern bool DestroyIcon(IntPtr handle);

        public static Icon Create(Color statusColor)
        {
            using (Bitmap bitmap = new Bitmap(32, 32))
            using (Graphics graphics = Graphics.FromImage(bitmap))
            using (Pen rim = new Pen(Color.FromArgb(228, 168, 75), 2f))
            using (Brush face = new SolidBrush(Color.FromArgb(23, 28, 29)))
            using (Brush light = new SolidBrush(statusColor))
            using (Font font = new Font("Segoe UI", 7f, FontStyle.Bold, GraphicsUnit.Pixel))
            using (Brush text = new SolidBrush(Color.FromArgb(232, 236, 234)))
            {
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.Clear(Color.Transparent);
                graphics.FillEllipse(face, 2, 2, 28, 28);
                graphics.DrawEllipse(rim, 3, 3, 26, 26);
                graphics.DrawString("CT", font, text, 8f, 9f);
                graphics.FillEllipse(light, 22, 21, 6, 6);
                IntPtr handle = bitmap.GetHicon();
                try
                {
                    using (Icon icon = Icon.FromHandle(handle))
                    {
                        return (Icon)icon.Clone();
                    }
                }
                finally
                {
                    DestroyIcon(handle);
                }
            }
        }
    }
}
