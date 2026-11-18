# LoveLog Expo prototype

Expo SDK 58.0.26, Expo Router 58.0.32, React Native 0.88.1, and TypeScript. Today, Chat, Interaction, and the companion use the 窗边小院 palette. The screens share the original dates and data types.

## Run on the web

Use Node.js 22.13 or later. Run these commands from the repository root.

```sh
cd expo-prototype
npm ci
npm run web -- --localhost --port 18126
```

Open `http://localhost:18126`. Select **互动** to open **聊天**. A check-in or a chat message saves to the prototype's local store. A fresh installation starts with no records. The sample backup uses fictional entries.

To make a sample file for the import check, run the following from `expo-prototype`.

```sh
npm run test:backup -- --write-sample
```

On **今日**, select **完整备份 → 导入 JSON**, choose `.expo/evidence/sample-backup.json`, and select **确认恢复**. Then select **导出 JSON**.

## Shared space and daily care

Set `VITE_CLOUD_API_URL` to the existing LoveLog API address before starting Expo. Use `npm run server` at the repository root for a local API test with an isolated data file. The server reads `LOVELOG_DATA_FILE` and `LOVELOG_JWT_SECRET`. Keep the server secret outside the project files. A server without the new companion capability still handles chat, wishes, events, and posts.

In **设置**, sign in to the same space on two clients. The first member can obtain the invite code from that panel. Once both are members, open **伙伴** and select **一起领养**. The server keeps one companion and assigns fixed A and B slots. The first recorded action per member and local day earns one point. A day with both slots earns a bonus point. The growth steps start at 4 and 10 points. Care saved while offline is sent after reconnect or **同步进度**.

A delivered wish links to the companion. The link earns no points. Interaction and Chat show the next upcoming anniversary and link to its date. The legacy app remains available for existing features outside the Expo screens.

**伙伴台词** uses the selected DeepSeek or Qwen model when a local key is saved. The request carries a fixed instruction, the growth stage, and the care action. Android and iOS use SecureStore. Web keeps the login and voice key for the current browser tab. The app uses a local line when the request fails or the key is missing. These keys and the generated lines stay outside backups and shared records.

The habitat is a replaceable placeholder. Cat art, model playback, and model performance checks are paused.

## Storage and backup

The native app uses Expo SQLite, and the web app uses a separate IndexedDB database. Both store one full JSON snapshot. A restore validates the file before it replaces all records and photos in one write. The browser database does not share a store with the current LoveLog app. Use a full backup file to move data between apps.

The complete version 3 sample has 29 top-level fields. A backup with care adds the optional `companions` field. The app keeps the original space and adoption identity with the records. A pending action is only sent under the matching account slot. The round trip kept the fields, values, and photo data. The export changed `exportedAt`. It also clears the three API key fields, as the current app does. Version 1 and 2 fixtures upgrade to version 3. The prototype supplies neutral defaults for absent settings and empty collections for absent records.

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

Run `npm run test:companion` to check the new API against an isolated database. It covers concurrent adoption and care, scoring, old backup and sync behavior, and the two AI request formats with synthetic responses. Android screenshots and the new backup comparison are under `.expo/garden-evidence/` in this checkout.

## Build scope

`eas.json` defines an internal preview and an iOS simulator profile. Android uses `com.nana.levelup`. The iOS bundle ID `com.example.lovelogprototype` is a placeholder pending confirmation.

The Android 15 emulator ran Today, Chat, Settings, and the companion in Expo Go 58.0.5. It joined the synthetic space, showed both care records, and displayed a photo sent from the browser. Native backup restore and export preserved the 30 fields and the photo. Only `exportedAt` changed.

Standalone Android and iOS builds, signing, iOS simulators, physical devices, and sync remain unverified. The installed Android SDK has API 35. Expo SDK 58 requires API 37 for a standalone Android build. No EAS remote build ran.
