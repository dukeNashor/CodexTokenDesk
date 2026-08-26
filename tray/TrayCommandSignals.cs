using System;
using System.Threading;

namespace CodexTokenDesk
{
    internal sealed class TrayCommandSignals : IDisposable
    {
        private const string Prefix = @"Local\CodexTokenDesk.Tray.";
        private readonly EventWaitHandle startEvent;
        private readonly EventWaitHandle stopEvent;
        private readonly EventWaitHandle restartEvent;
        private readonly EventWaitHandle exitEvent;

        private TrayCommandSignals(EventWaitHandle start, EventWaitHandle stop, EventWaitHandle restart, EventWaitHandle exit)
        {
            startEvent = start;
            stopEvent = stop;
            restartEvent = restart;
            exitEvent = exit;
        }

        public static TrayCommandSignals CreateOwner()
        {
            bool created;
            return new TrayCommandSignals(
                new EventWaitHandle(false, EventResetMode.AutoReset, Prefix + "Start", out created),
                new EventWaitHandle(false, EventResetMode.AutoReset, Prefix + "Stop", out created),
                new EventWaitHandle(false, EventResetMode.AutoReset, Prefix + "Restart", out created),
                new EventWaitHandle(false, EventResetMode.AutoReset, Prefix + "Exit", out created));
        }

        public static bool TrySignal(string command)
        {
            string eventName = GetEventName(command);
            if (eventName == null) return false;
            try
            {
                using (EventWaitHandle signal = EventWaitHandle.OpenExisting(eventName))
                {
                    signal.Set();
                    LifecycleLog.Write("command.signaled", command);
                    return true;
                }
            }
            catch (WaitHandleCannotBeOpenedException)
            {
                return false;
            }
        }

        public bool TakeStart()
        {
            return startEvent.WaitOne(0);
        }

        public bool TakeStop()
        {
            return stopEvent.WaitOne(0);
        }

        public bool TakeRestart()
        {
            return restartEvent.WaitOne(0);
        }

        public bool TakeExit()
        {
            return exitEvent.WaitOne(0);
        }

        public void Dispose()
        {
            startEvent.Dispose();
            stopEvent.Dispose();
            restartEvent.Dispose();
            exitEvent.Dispose();
        }

        private static string GetEventName(string command)
        {
            switch (command)
            {
                case "--start": return Prefix + "Start";
                case "--stop": return Prefix + "Stop";
                case "--restart": return Prefix + "Restart";
                case "--exit": return Prefix + "Exit";
                default: return null;
            }
        }
    }
}
