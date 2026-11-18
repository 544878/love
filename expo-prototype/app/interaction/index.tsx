import { View } from "react-native";
import { useBackup } from "../../lib/backup-state";
import { AnniversaryNote, CareShortcut } from "../../lib/garden-components";
import { Heading, Page, Shortcut, ui } from "../../lib/ui";

export default function Interaction() {
  const { state } = useBackup();
  if (state.status !== "ready") return null;
  return <Page>
    <Heading title="互动" />
    <View style={ui.row}>
      <Shortcut href="/interaction/chat" label="聊天" detail="我们的对话" style={{ flex: 1 }} />
      <CareShortcut />
    </View>
    <AnniversaryNote data={state.data} />
    <Shortcut href="/interaction/wishes" label="投喂愿望" detail="一起记下想吃的东西" />
    <Shortcut href="/interaction/calendar" label="共同日历" detail="约会与纪念日" />
    <Shortcut href="/interaction/memories" label="共享回忆" detail="动态、课表和小游戏" />
  </Page>;
}
