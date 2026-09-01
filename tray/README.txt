Codex Token Desk
===================

双击 CodexTokenDesk.exe：启动托盘控制器和 Dashboard。
双击托盘图标：打开 http://127.0.0.1:3002。
右键托盘图标：启动、停止、重启、设置随 Windows 启动或退出。
退出托盘程序时会同步停止 Dashboard。
托盘异常退出或被强制结束时，也会同步终止 Node 服务进程树。

运行状态文件：%LOCALAPPDATA%\CodexTokenDesk\server.json
生命周期日志：%LOCALAPPDATA%\CodexTokenDesk\logs\lifecycle.log

这是 Windows x64 standalone 发布包，解压后可从任意目录运行，
无需安装 Node.js、pnpm 或保留项目源码。包内的 runtime\node\node.exe
会直接启动 .next\standalone\server.js；Dashboard 仍只读取当前用户的
%USERPROFILE%\.codex\sessions 和 archived_sessions。
