import { useState } from "react";
import { Text, View } from "react-native";
import { exportBackup, readBackup, type StoredBackup } from "./backup";
import { pickBackup, saveBackupFile } from "./backup-file";
import { useBackup } from "./backup-state";
import { Action, ui } from "./ui";

export function BackupPanel({ data }: { data: StoredBackup }) {
  const [pending, setPending] = useState<StoredBackup | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const { save, saving } = useBackup();

  async function selectFile() {
    setWorking(true);
    setMessage("");
    try {
      const json = await pickBackup();
      if (json !== null) setPending(readBackup(json));
    } catch {
      setMessage("无法读取备份。请选择 LoveLog 的完整备份 JSON。");
    } finally {
      setWorking(false);
    }
  }

  async function restore() {
    if (!pending) return;
    try {
      if (await save(pending)) {
        setPending(null);
        setMessage("备份已恢复。");
      }
    } catch {
      setMessage("无法保存备份。请检查可用存储空间。");
    }
  }

  async function exportFile() {
    setWorking(true);
    setMessage("");
    try {
      await saveBackupFile(exportBackup(data));
      setMessage("已生成备份文件。");
    } catch {
      setMessage("无法导出备份文件。");
    } finally {
      setWorking(false);
    }
  }

  const busy = working || saving;
  return (
    <View style={ui.card}>
      <Text accessibilityRole="header" style={ui.section}>完整备份</Text>
      {pending
        ? (
          <>
            <Text style={ui.text}>恢复后，此原型中的数据和照片会替换成备份里的内容。</Text>
            <Text style={ui.muted}>{pending.habits.length} 项习惯 · {pending.coupleMessages.length} 条消息</Text>
            <View style={ui.row}>
              <Action label="确认恢复" primary disabled={busy} onPress={restore} />
              <Action label="取消" disabled={busy} onPress={() => setPending(null)} />
            </View>
          </>
        )
        : (
          <View style={ui.row}>
            <Action label="导入 JSON" disabled={busy} onPress={selectFile} />
            <Action label="导出 JSON" disabled={busy} onPress={exportFile} />
          </View>
        )}
      {message !== "" && <Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text>}
    </View>
  );
}
