# AGENTS.md

本文件是所有维护者和自动化 Agent 的必读入口。修改代码前，必须先阅读本文件。

## 核心约束

- 不得改变现有软件功能、数据格式、应用 ID `com.nana.levelup` 或用户可见行为，除非用户明确提出功能变更。
- 优先做可验证的小改动。整理目录时只调整路径和文档，不借机重写业务逻辑。
- 删除任何文件前，先列出完整路径并等待用户明确确认。禁止大范围删除、清空目录或格式化磁盘。
- 不得提交 API Key、密码、Token、签名文件、`google-services.json`、`.env.local` 或本机 SDK 路径。
- 不得提交 `node_modules`、`dist`、Gradle 缓存、Android 构建目录、本地工具链或 APK。

## 项目结构

- `src/`：React/TypeScript 业务代码。
- `src/.private/`：云同步和外部 AI 服务实现。这里的“private”表示内部模块，不代表可存放秘密。
- `public/`：静态资源。
- `android/`：Capacitor Android 工程源码。
- `scripts/`：构建脚本。
- `artifacts/android/`：本地 APK 产物，仅保留说明文件到 Git。
- `.tools/android/`：本地 JDK 与 Android SDK，永不提交。
- `.archive/`：迁移时保留的完整原始快照，永不提交。

## 云端与秘密

- LeanCloud 配置只通过 `VITE_LEANCLOUD_APP_ID`、`VITE_LEANCLOUD_APP_KEY`、`VITE_LEANCLOUD_SERVER_URL` 注入。
- 本地开发使用 `.env.local`；仓库只保留无秘密的 `.env.example`。
- DeepSeek、Qwen、Serper 密钥由应用设置管理。调试输出不得打印这些值。
- `src/.private/` 中的代码仍会被打包进客户端，不能把服务器密钥硬编码到其中。

## 验证要求

修改后至少执行：

```powershell
npm test
npm run build
```

涉及 Android 时还要执行：

```powershell
npm run android:apk
```

构建失败时记录具体原因，不得通过跳过测试或放宽类型检查掩盖问题。
