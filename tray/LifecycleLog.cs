using System;
using System.IO;
using System.Text;

namespace CodexTokenDesk
{
    internal static class LifecycleLog
    {
        private static readonly object Sync = new object();
        private static readonly string LogFile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CodexTokenDesk",
            "logs",
            "lifecycle.log");

        public static void Write(string eventName, string message)
        {
            try
            {
                lock (Sync)
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(LogFile));
                    string line = DateTime.UtcNow.ToString("o") + "\t" + eventName + "\t" + Sanitize(message) + Environment.NewLine;
                    File.AppendAllText(LogFile, line, new UTF8Encoding(false));
                }
            }
            catch
            {
                // Diagnostics must never bring down the tray application.
            }
        }

        private static string Sanitize(string value)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            return value.Replace("\r", " ").Replace("\n", " ").Replace("\t", " ");
        }
    }
}
