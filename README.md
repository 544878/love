# LoveLog

LoveLog 是学习、生活和关系记录应用。Android 客户端使用 Kotlin 与 Jetpack Compose，应用 ID 为 `com.nana.levelup`。数据默认保存在本机，可选连接到自建服务同步。DeepSeek、千问和 Serper 密钥只放在应用设置里。

端侧识图已经移除。

## Android

需要 JDK 17 或更高版本，以及 Android SDK Platform 36。云同步地址在构建时从环境变量 `VITE_CLOUD_API_URL` 注入，须为完整的 HTTP 或 HTTPS 地址。

```powershell
npm run android:apk
```

调试包输出到 `artifacts/android/`。本地 JDK 与 SDK 可以放在 `.tools/android/`，该目录不提交。

业务规则测试：

```powershell
android\gradlew.bat -p android :logic:test
```

## 云同步服务

`server/index.mjs` 提供账号、共享空间、同步和照片接口。复制 `server/.env.example` 到进程环境，至少设置 32 位以上的 `LOVELOG_JWT_SECRET`，然后运行：

```powershell
npm run server
```

服务器数据文件包含密码哈希和用户数据，必须备份且不得提交。完整使用说明见 [LOVELOG操作手册.md](./LOVELOG操作手册.md)，维护规则见 [AGENTS.md](./AGENTS.md)。
