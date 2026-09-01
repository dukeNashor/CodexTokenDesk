using System;
using System.Diagnostics;
using System.Drawing;
using System.Reflection;
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

        [STAThread]
        private static void Main(string[] args)
        {
            ConfigureExceptionLogging();
            string command = args.Length > 0 ? args[0].ToLowerInvariant() : null;
            if (command == "--open")
            {
                ServerController.OpenDashboard();
                return;
            }
            bool lifecycleCommand = command == "--start" || command == "--stop" || command == "--restart" || command == "--exit";
            if (lifecycleCommand && TrayCommandSignals.TrySignal(command)) return;
            if (lifecycleCommand && command != "--start") return;

            bool createdNew;
            using (Mutex mutex = new Mutex(true, MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    if (!string.IsNullOrEmpty(command)) TrayCommandSignals.TrySignal(command);
                    else ServerController.OpenDashboard();
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (TrayCommandSignals commandSignals = TrayCommandSignals.CreateOwner())
                {
                    LifecycleLog.Write("tray.started", "pid=" + Process.GetCurrentProcess().Id);
                    Application.Run(new TrayApplicationContext(commandSignals));
                    LifecycleLog.Write("tray.exited", "pid=" + Process.GetCurrentProcess().Id);
                }
            }
        }

        private static void ConfigureExceptionLogging()
        {
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object sender, ThreadExceptionEventArgs e)
            {
                LifecycleLog.Write("tray.unhandled-ui", e.Exception.ToString());
                Environment.FailFast("Codex Token Desk UI thread failed.", e.Exception);
            };
            AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e)
            {
                Exception exception = e.ExceptionObject as Exception;
                LifecycleLog.Write("tray.unhandled-domain", exception == null ? Convert.ToString(e.ExceptionObject) : exception.ToString());
            };
            TaskScheduler.UnobservedTaskException += delegate(object sender, UnobservedTaskExceptionEventArgs e)
            {
                LifecycleLog.Write("tray.unobserved-task", e.Exception.ToString());
                e.SetObserved();
            };
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
        private readonly TrayCommandSignals commandSignals;
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
        private DateTime nextStateRefreshUtc;

        public TrayApplicationContext(TrayCommandSignals signals)
        {
            commandSignals = signals;
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
                    LifecycleLog.Write("startup-registration.failed", ex.GetType().Name + ": " + ex.Message);
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
            currentIcon = TrayIconFactory.Create();
            notifyIcon.Icon = currentIcon;
            notifyIcon.Visible = true;

            timer = new System.Windows.Forms.Timer();
            timer.Interval = 250;
            nextStateRefreshUtc = DateTime.UtcNow.AddSeconds(5);
            timer.Tick += async delegate
            {
                if (!operationInProgress && commandSignals.TakeExit()) await ExitAsync();
                else if (!operationInProgress && commandSignals.TakeRestart()) await RestartServiceAsync();
                else if (!operationInProgress && commandSignals.TakeStop()) await StopServiceAsync(false);
                else if (!operationInProgress && commandSignals.TakeStart()) await StartServiceAsync(false);
                else RefreshObservedStateIfDue();
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
                LifecycleLog.Write("service.start.failed", ex.GetType().Name + ": " + ex.Message);
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
                LifecycleLog.Write("service.stop.failed", ex.GetType().Name + ": " + ex.Message);
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
                LifecycleLog.Write("service.restart.failed", ex.GetType().Name + ": " + ex.Message);
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
            catch (Exception ex)
            {
                LifecycleLog.Write("service.exit-cleanup.failed", ex.GetType().Name + ": " + ex.Message);
                // Exit should not be blocked by a failed cleanup attempt.
            }
            notifyIcon.Visible = false;
            ExitThread();
        }

        private void RefreshObservedState()
        {
            if (operationInProgress || exiting) return;
            if (controller.HasUnexpectedExit())
            {
                try
                {
                    controller.CleanupUnexpectedExit();
                }
                catch (Exception ex)
                {
                    LifecycleLog.Write("service.cleanup.failed", ex.GetType().Name + ": " + ex.Message);
                }
                ApplyState(ServiceState.Faulted);
                return;
            }
            if (state == ServiceState.Faulted) return;
            ApplyState(controller.IsDashboardRunning() ? ServiceState.Running : ServiceState.Stopped);
        }

        private void RefreshObservedStateIfDue()
        {
            if (DateTime.UtcNow < nextStateRefreshUtc) return;
            nextStateRefreshUtc = DateTime.UtcNow.AddSeconds(5);
            RefreshObservedState();
        }

        private void ApplyState(ServiceState nextState)
        {
            state = nextState;
            string label;
            switch (state)
            {
                case ServiceState.Running:
                    label = "状态：运行中 · " + ServerController.DashboardAddress;
                    break;
                case ServiceState.Starting:
                    label = "状态：正在启动…";
                    break;
                case ServiceState.Stopping:
                    label = "状态：正在停止…";
                    break;
                case ServiceState.Faulted:
                    label = "状态：启动异常";
                    break;
                default:
                    label = "状态：已停止";
                    break;
            }

            statusItem.Text = label;
            startItem.Enabled = !operationInProgress && state != ServiceState.Running;
            stopItem.Enabled = !operationInProgress && state == ServiceState.Running;
            restartItem.Enabled = !operationInProgress && state == ServiceState.Running;
            notifyIcon.Text = state == ServiceState.Running ? "Codex Token Desk - 运行中" : "Codex Token Desk - 已停止";
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
        public static Icon Create()
        {
            using (Icon icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath))
            {
                if (icon == null) throw new InvalidOperationException("Unable to extract the application icon.");
                return (Icon)icon.Clone();
            }
        }
    }
}
