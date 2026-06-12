# LoveLog

LoveLog 是一个 React、TypeScript、Vite 与 Capacitor 构建的关系和成长记录应用。应用以本地 IndexedDB 为主存储，可选使用 LeanCloud 同步，并支持 DeepSeek、Qwen 与 Serper 能力。

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

## 云同步

复制 `.env.example` 为 `.env.local`，填写 LeanCloud 配置。不要提交 `.env.local`。未配置云端时，应用仍可离线使用。

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
