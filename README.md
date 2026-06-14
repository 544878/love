# LoveLog

LoveLog 是一个 React、TypeScript、Vite 与 Capacitor 构建的关系和成长记录应用。应用以本地 IndexedDB 为主存储，可选使用部署在阿里云应用服务器上的自有服务同步，并支持 DeepSeek、Qwen 与 Serper 能力。

面向使用者、管理员和维护者的完整说明见 [LOVELOG操作手册.md](./LOVELOG操作手册.md)。

## 开发

```powershell
npm ci
npm run dev
```

常用检查：

```powershell
npm test
npm run build
```

## 网页与云同步

前端网页：

```powershell
npm run build
```

构建结果位于 `dist/`。生产环境由 `server/index.mjs` 同时提供网页与 `/api` 接口。

同源部署默认使用 `/api`，不需要前端环境文件；前后端分离时复制 `.env.example` 为 `.env.local`，将 `VITE_CLOUD_API_URL` 改为完整 HTTPS API 地址。不要提交 `.env.local`。

服务器复制 `server/.env.example` 中的配置到进程环境，至少设置 32 位以上的 `LOVELOG_JWT_SECRET`，然后运行：

```powershell
npm run server
```

服务器会将账号、共享空间、同步记录和照片持久化到 `LOVELOG_DATA_FILE`。该文件包含密码哈希和用户数据，必须备份且不得提交到 Git。第一位成员创建空间后会看到邀请码，另一位成员使用相同空间 ID 与邀请码加入，双方权限相同。生产环境完成账号创建后可设置 `LOVELOG_ALLOW_REGISTRATION=false`。

## Android

项目内本地工具约定：

- JDK 21：`.tools/android/jdk-21/jdk-21.0.11+10`
- Android SDK：`.tools/android/sdk`
- APK 输出：`artifacts/android/`

也可以使用系统的 `JAVA_HOME` 和 `ANDROID_SDK_ROOT`。构建命令：

```powershell
npm run android:apk
```

完整维护规则见 `AGENTS.md`。
