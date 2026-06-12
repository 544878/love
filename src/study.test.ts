import { describe, expect, it } from "vitest";
import { elapsedTimerSeconds, finishStudyTimer, pauseStudyTimer, resumeStudyTimer, startStudyTimer, todayStudySeconds, totalStudySeconds } from "./study";
import { initialData } from "./data";
import type { AppData, CheckIn, DailyReport } from "./types";

const at = (iso: string) => new Date(iso);

describe("study timer helpers", () => {
  it("starts, pauses, resumes, and finishes a forward timer", () => {
    const started = startStudyTimer("阅读", "chapter 1", at("2026-06-08T10:00:00.000Z"));
    expect(elapsedTimerSeconds(started, at("2026-06-08T10:01:30.000Z"))).toBe(90);

    const paused = pauseStudyTimer(started, at("2026-06-08T10:02:00.000Z"));
    expect(paused.running).toBe(false);
    expect(paused.accumulatedSeconds).toBe(120);

    const resumed = resumeStudyTimer(paused, at("2026-06-08T10:05:00.000Z"));
    const session = finishStudyTimer(resumed, at("2026-06-08T10:06:15.000Z"));
    expect(session.durationSeconds).toBe(195);
    expect(session.title).toBe("阅读");
    expect(session.source).toBe("timer");
  });

  it("prefers study sessions while keeping legacy study minutes compatible", () => {
    const checkIn: CheckIn = {
      id: "legacy-check",
      habitId: "study",
      date: "2026-06-08",
      value: 30,
      note: "",
      completed: true,
      updatedAt: "2026-06-08T10:00:00.000Z"
    };
    const report: DailyReport = {
      id: "legacy-report",
      date: "2026-06-08",
      mood: "鍏冩皵婊℃弧" as DailyReport["mood"],
      studyMinutes: 45,
      lifeNote: "",
      message: "",
      submittedAt: "2026-06-08T20:00:00.000Z"
    };
    const data: AppData = {
      ...initialData,
      checkIns: [checkIn],
      reports: [report],
      studySessions: []
    };
    expect(totalStudySeconds(data)).toBe(45 * 60);

    const withSessions: AppData = {
      ...data,
      studySessions: [{
        id: "session-1",
        date: "2026-06-08",
        title: "阅读",
        note: "",
        startedAt: "2026-06-08T10:00:00.000Z",
        endedAt: "2026-06-08T11:20:00.000Z",
        durationSeconds: 80 * 60,
        source: "timer"
      }]
    };
    expect(totalStudySeconds(withSessions)).toBe(80 * 60);
    expect(todayStudySeconds(withSessions, "2026-06-08")).toBe(80 * 60);
  });
});
