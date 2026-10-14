# AGENTS.md

本文件是所有维护者和自动化 Agent 的必读入口。修改代码前，必须先阅读本文件。

## 核心约束

- 不得改变现有软件功能、数据格式、应用 ID `com.nana.levelup` 或用户可见行为，除非用户明确提出功能变更。
- 优先做可验证的小改动。整理目录时只调整路径和文档，不借机重写业务逻辑。
- 删除任何文件前，先列出完整路径并等待用户明确确认。禁止大范围删除、清空目录或格式化磁盘。
- 不得提交 API Key、密码、Token、签名文件、`google-services.json`、`.env.local` 或本机 SDK 路径。
- 不得提交 `node_modules`、`dist`、Gradle 缓存、Android 构建目录、本地工具链或 APK。

## 项目结构

- `android/`：Jetpack Compose 客户端，应用 ID `com.nana.levelup`。
- `logic/`：与界面无关的记录、学习和同步规则，附带单元测试。
- `server/`：云同步 API。
- `scripts/`：构建脚本。
- `artifacts/android/`：本地 APK 产物，仅保留说明文件到 Git。
- `.tools/android/`：本地 JDK 与 Android SDK，永不提交。
- `.archive/`：迁移时保留的完整原始快照，永不提交。

## 云端与秘密

- 阿里云同步 API 地址只通过 `VITE_CLOUD_API_URL` 注入；服务器密钥只通过 `LOVELOG_JWT_SECRET` 注入。
- 本地开发使用 `.env.local`；仓库只保留无秘密的 `.env.example`。
- DeepSeek、Qwen、Serper 密钥由应用设置管理。调试输出不得打印这些值。
- `src/.private/` 中的代码仍会被打包进客户端，不能把服务器密钥硬编码到其中。

## 验证要求

修改客户端或 `logic/` 后至少执行：

```powershell
android\gradlew.bat -p android :logic:test assembleDebug
```

修改云同步服务后，确认 `node server/index.mjs` 能在设置 `LOVELOG_JWT_SECRET` 的情况下启动。

构建失败时记录具体原因，不得通过跳过测试或放宽类型检查掩盖问题。
