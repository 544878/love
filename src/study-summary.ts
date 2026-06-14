import type { AppData, DailyStudySummary } from "./types";

export function buildTodayStudySummary(data: AppData, date: string, owner: "ru" | "taotao" = "ru"): string[] {
  const sessions = data.studySessions.filter((item) => item.date === date && (item.owner ?? "ru") === owner);
  const exercises = data.studyMetrics.filter((item) => item.date === date && item.kind === "exercise" && (item.owner ?? "ru") === owner);
  const words = data.wordLearningRecords.filter((item) => item.date === date && item.owner === owner);
  const tasks = data.dailyTaskRecords.filter((item) => item.date === date && item.owner === owner && item.completed);
  return [
    ...sessions.map((item) => `${item.title} ${Math.max(1, Math.round(item.durationSeconds / 60))} 分钟`),
    ...exercises.map((item) => `${item.title} ${item.count} 道${item.durationMinutes ? `，用时 ${item.durationMinutes} 分钟` : ""}`),
    ...words.map((item) => `新学 ${item.newWords} 个单词，复习 ${item.reviewedWords} 个`),
    ...tasks.map((item) => `完成学习任务「${item.title}」`)
  ];
}

export function studySummarySourceHash(data: AppData, date: string, owner: "ru" | "taotao" = "ru"): string {
  return JSON.stringify({
    sessions: data.studySessions
      .filter((item) => item.date === date && (item.owner ?? "ru") === owner)
      .map(({ id, title, note, durationSeconds, endedAt }) => ({ id, title, note, durationSeconds, endedAt })),
    metrics: data.studyMetrics
      .filter((item) => item.date === date && (item.owner ?? "ru") === owner)
      .map(({ id, kind, title, count, durationMinutes }) => ({ id, kind, title, count, durationMinutes })),
    words: data.wordLearningRecords
      .filter((item) => item.date === date && item.owner === owner)
      .map(({ id, newWords, reviewedWords, note }) => ({ id, newWords, reviewedWords, note })),
    tasks: data.dailyTaskRecords
      .filter((item) => item.date === date && item.owner === owner && item.completed)
      .map(({ id, title, group, value, target, unit, note }) => ({ id, title, group, value, target, unit, note }))
  });
}

export function localStudySummaryText(lines: string[]): string {
  return lines.length
    ? `今天完成了${lines.join("、")}。每一段专注都算数，照着自己的节奏继续就很好。`
    : "";
}

export function upsertDailyStudySummary(
  summaries: DailyStudySummary[],
  summary: DailyStudySummary
): DailyStudySummary[] {
  return [summary, ...summaries.filter((item) => !(item.date === summary.date && item.owner === summary.owner))];
}
