# sub2api Connect

`sub2api Connect` 是 `sub2api` 的跨平台桌面客户端骨架，目标平台为 Windows、macOS、Ubuntu/Linux。

当前 MVP 已包含：
- 服务器地址保存
- 登录 / 2FA 登录
- 拉取当前用户 API Key
- 一键启动本地 OpenAI 兼容代理
- 展示本地接入地址与基础状态
- 应用内检查更新 / 下载更新 / 重启安装（仅正式打包版可用）

## 目录结构

- `electron/`：Electron 主进程、preload、IPC、本地代理
- `src/`：Vue renderer
- `src/shared/`：主进程与 renderer 共享类型

## 开发

```bash
npm install
npm run typecheck
npm run build
```

本地联调：

```bash
npm run dev
```

## 打包

Windows：

```bash
npm run dist:win
```

macOS：

```bash
npm run dist:mac
```

Linux：

```bash
npm run dist:linux
```

注意：
- Linux 上可以准备脚本和部分产物，但无法可靠地产出已签名的 macOS 安装包。
- 最佳实践是在 GitHub Actions 上分别使用 `windows-latest`、`macos-latest` runner 构建。
- 若要分发给终端用户，macOS 还需要 Apple Developer 签名/公证，Windows 建议使用代码签名证书。

## 自动更新发布

桌面端自动更新基于 `electron-updater + GitHub Releases`。

- 发布源：你当前这个 GitHub 仓库自己的 Releases（不是固定写死源仓库）
- Windows 依赖 `latest.yml`
- macOS 依赖 `latest-mac.yml`
- Linux 依赖 `latest-linux.yml`，并一并上传 AppImage / deb / tar.gz 等产物

仓库已新增工作流：

```bash
.github/workflows/connect-release.yml
```

触发方式：
- 推送 `v*` tag 时自动执行
- 或手动运行 workflow_dispatch，并指定 `v1.2.3` 这类 tag

工作流会：
1. 把 `connect/package.json` 版本号同步为 tag 去掉前缀 `v` 后的版本
2. 在 Ubuntu / Windows / macOS runner 上构建安装包
3. 上传安装包与自动更新元数据到对应 GitHub Release

使用限制：
- `npm run dev` 下不会真正检查更新，这是 Electron 的正常限制
- 真正的更新检查只在已安装的打包应用中可用
- 若 macOS/Windows 没有签名，最终可能会影响系统信任体验，但不影响更新元数据生成链路本身

## 当前边界

当前版本仍是 MVP：
- 不包含系统级 VPN/TUN
- 不自动修改系统代理
- 不包含托盘、自启动
- 不包含高级诊断与客户端一键配置脚本

这些都可以在后续阶段继续补齐。
