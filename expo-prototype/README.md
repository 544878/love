# LoveLog Expo prototype

Expo SDK 58.0.26, Expo Router 58.0.32, React Native 0.88.1, and TypeScript. The two screens use the original date functions and data types. The test data uses 示例A and 示例B.

## Run on the web

Use Node.js 22.13 or later. Run these commands from the repository root.

```sh
cd expo-prototype
npm ci
npm run web -- --localhost --port 18126
```

Open `http://localhost:18126`. Select **互动** to open **聊天**. A check-in or a chat message saves to the prototype's local store. The first visit shows sample data.

To make a sample file for the import check, run the following from `expo-prototype`.

```sh
npm run test:backup -- --write-sample
```

On **今日**, select **完整备份 → 导入 JSON**, choose `.expo/evidence/sample-backup.json`, and select **确认恢复**. Then select **导出 JSON**.

## Storage and backup

The native app uses Expo SQLite, and the web app uses a separate IndexedDB database. Both store one full JSON snapshot. A restore validates the file before it replaces all records and photos in one write. The browser database does not share a store with the current LoveLog app. Use a full backup file to move data between apps.

The complete version 3 sample has 29 top-level fields. The round trip kept the fields, values, and photo data. The export changed `exportedAt`. It also clears the three API key fields, as the current app does. Version 1 and 2 fixtures upgrade to version 3. The prototype supplies neutral defaults for absent settings and empty collections for absent records.

## Local checks

| Command or check | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` in the repository root | Installed the current app's locked dependencies. |
| `npm test` in the repository root | 18 tests passed in 5 files. |
| `npm run build` in the repository root | Vite built the current app. It reported browser compatibility and chunk size warnings. |
| `npm install --no-audit --no-fund` in `expo-prototype` | Installed the prototype dependencies and recorded them in the lockfile. |
| `npm run typecheck` in `expo-prototype` | Passed. |
| `CI=1 EXPO_NO_TELEMETRY=1 npx expo install --check` | Expo reported that the dependencies were up to date. |
| `npm run test:backup -- --write-sample` | Passed the complete version 3 round trip, older-version fixtures, key redaction, and invalid JSON checks. |
| `EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npx expo config --type public --json` | Checked the SDK and application identifiers. |
| `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 npx expo start --localhost --port 18126` | Metro served both routes. At 430 × 880, check-ins and chat messages survived reload. The file picker restored the sample and replaced the edits. The export contained 29 fields and one photo. Only `exportedAt` differed from the stored sample. |

Screenshots and the sample file are under `.expo/evidence/` in this checkout.

## Build scope

`eas.json` defines an internal preview and an iOS simulator profile. Android uses `com.nana.levelup`. The iOS bundle ID `com.example.lovelogprototype` is a placeholder pending confirmation.

The Android 15 emulator ran both screens in Expo Go 58.0.5. The system picker imported the synthetic backup, and the native share action exported it. A cold start kept the restored records and photo. The 29 top-level fields matched except for `exportedAt`.

Standalone Android and iOS builds, signing, iOS simulators, physical devices, and sync remain unverified. The installed Android SDK has API 35. Expo SDK 58 requires API 37 for a standalone Android build. No EAS remote build ran.
