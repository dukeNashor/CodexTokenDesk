using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace CodexTokenDesk
{
    [DataContract]
    internal sealed class ServerInstanceRecord
    {
        [DataMember(Name = "version", Order = 1)]
        public int Version { get; set; }

        [DataMember(Name = "instanceId", Order = 2)]
        public string InstanceId { get; set; }

        [DataMember(Name = "port", Order = 3)]
        public int Port { get; set; }

        [DataMember(Name = "repositoryRoot", Order = 4)]
        public string RepositoryRoot { get; set; }

        [DataMember(Name = "launcherProcessId", Order = 5)]
        public int LauncherProcessId { get; set; }

        [DataMember(Name = "launcherStartTimeUtcTicks", Order = 6)]
        public long LauncherStartTimeUtcTicks { get; set; }

        [DataMember(Name = "listenerProcessId", Order = 7)]
        public int ListenerProcessId { get; set; }

        [DataMember(Name = "listenerStartTimeUtcTicks", Order = 8)]
        public long ListenerStartTimeUtcTicks { get; set; }
    }

    internal sealed class ServerInstanceStore
    {
        private readonly string filePath;

        public ServerInstanceStore()
        {
            filePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "CodexTokenDesk",
                "server.json");
        }

        public string FilePath
        {
            get { return filePath; }
        }

        public ServerInstanceRecord Read()
        {
            if (!File.Exists(filePath)) return null;
            try
            {
                string json = File.ReadAllText(filePath, Encoding.UTF8).TrimStart('\uFEFF');
                using (MemoryStream stream = new MemoryStream(Encoding.UTF8.GetBytes(json)))
                {
                    DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(ServerInstanceRecord));
                    return (ServerInstanceRecord)serializer.ReadObject(stream);
                }
            }
            catch (Exception ex)
            {
                LifecycleLog.Write("state.read.failed", ex.GetType().Name + ": " + ex.Message);
                return null;
            }
        }

        public void Write(ServerInstanceRecord record)
        {
            string directory = Path.GetDirectoryName(filePath);
            Directory.CreateDirectory(directory);
            string temporaryFile = filePath + ".tmp";
            using (FileStream stream = new FileStream(temporaryFile, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(ServerInstanceRecord));
                serializer.WriteObject(stream, record);
                stream.Flush(true);
            }

            if (File.Exists(filePath)) File.Replace(temporaryFile, filePath, null);
            else File.Move(temporaryFile, filePath);
        }

        public void DeleteIfMatches(string instanceId)
        {
            if (string.IsNullOrEmpty(instanceId)) return;
            ServerInstanceRecord record = Read();
            if (record != null && string.Equals(record.InstanceId, instanceId, StringComparison.Ordinal))
            {
                File.Delete(filePath);
            }
        }
    }
}
