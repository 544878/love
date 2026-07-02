import { localDate } from "./date";
import type { ActiveStudyTimer, AppData, StudySession } from "./types";

const MINUTE_SECONDS = 60;

export function elapsedTimerSeconds(timer?: ActiveStudyTimer, now = new Date()): number {
  if (!timer) return 0;
  const liveSeconds = timer.running
    ? Math.max(0, Math.floor((now.getTime() - new Date(timer.startedAt).getTime()) / 1000))
    : 0;
  return Math.max(0, Math.floor(timer.accumulatedSeconds + liveSeconds));
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = String(safe % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export function startStudyTimer(title: string, note = "", now = new Date(), owner: "ru" | "taotao" = "ru"): ActiveStudyTimer {
  const at = now.toISOString();
  return {
    id: `study-timer-${now.getTime()}`,
    title: title.trim() || "学习",
    note: note.trim(),
    startedAt: at,
    accumulatedSeconds: 0,
    running: true,
    updatedAt: at,
    owner
  };
}

export function pauseStudyTimer(timer: ActiveStudyTimer, now = new Date()): ActiveStudyTimer {
  return {
    ...timer,
    accumulatedSeconds: elapsedTimerSeconds(timer, now),
    running: false,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

export function resumeStudyTimer(timer: ActiveStudyTimer, now = new Date()): ActiveStudyTimer {
  const at = now.toISOString();
  return {
    ...timer,
    startedAt: at,
    running: true,
    updatedAt: at
  };
}

export function finishStudyTimer(timer: ActiveStudyTimer, now = new Date()): StudySession {
  const endedAt = now.toISOString();
  const durationSeconds = elapsedTimerSeconds(timer, now);
  return {
    id: `study-session-${now.getTime()}`,
    date: localDate(now),
    title: timer.title.trim() || "学习",
    note: timer.note.trim(),
    startedAt: timer.id.startsWith("study-timer-") ? new Date(Number(timer.id.replace("study-timer-", ""))).toISOString() : timer.startedAt,
    endedAt,
    durationSeconds,
    source: "timer",
    syncStatus: "local",
    owner: timer.owner ?? "ru"
  };
}

export function legacyStudySeconds(data: Pick<AppData, "checkIns" | "habits" | "reports">): number {
  const checkInMinutes = data.checkIns.reduce((sum, item) => {
    const habit = data.habits.find((candidate) => candidate.id === item.habitId);
    const isMinuteHabit = habit?.id === "study" || String(habit?.unit ?? "").includes("分") || String(habit?.unit ?? "") === "鍒嗛挓";
    return sum + (item.completed && isMinuteHabit ? item.value : 0);
  }, 0);
  const reportMinutes = data.reports.reduce((sum, report) => sum + Math.max(0, report.studyMinutes || 0), 0);
  return Math.max(checkInMinutes, reportMinutes) * MINUTE_SECONDS;
}

export function totalStudySeconds(data: AppData, now = new Date()): number {
  const sessionSeconds = (data.studySessions ?? []).reduce((sum, item) => sum + Math.max(0, item.durationSeconds), 0);
  const legacySeconds = legacyStudySeconds(data);
  return Math.max(sessionSeconds, legacySeconds) + elapsedTimerSeconds(data.activeStudyTimer, now);
}

export function todayStudySeconds(data: AppData, date = localDate(), now = new Date()): number {
  const sessionSeconds = (data.studySessions ?? [])
    .filter((item) => item.date === date)
    .reduce((sum, item) => sum + Math.max(0, item.durationSeconds), 0);
  const activeSeconds = data.activeStudyTimer && localDate(new Date(data.activeStudyTimer.startedAt)) === date
    ? elapsedTimerSeconds(data.activeStudyTimer, now)
    : 0;
  if (sessionSeconds || activeSeconds) return sessionSeconds + activeSeconds;
  const reportMinutes = data.reports.find((report) => report.date === date)?.studyMinutes ?? 0;
  const checkInMinutes = data.checkIns.reduce((sum, item) => {
    const habit = data.habits.find((candidate) => candidate.id === item.habitId);
    const isMinuteHabit = habit?.id === "study" || String(habit?.unit ?? "").includes("分") || String(habit?.unit ?? "") === "鍒嗛挓";
    return sum + (item.date === date && item.completed && isMinuteHabit ? item.value : 0);
  }, 0);
  return Math.max(reportMinutes, checkInMinutes) * MINUTE_SECONDS;
}

export function studyMinutesLabel(seconds: number): string {
  return `${Math.floor(Math.max(0, seconds) / MINUTE_SECONDS)} 分钟`;
}
