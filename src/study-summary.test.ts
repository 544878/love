import { describe, expect, it } from "vitest";
import { initialData } from "./data";
import { buildTodayStudySummary, localStudySummaryText, studySummarySourceHash, upsertDailyStudySummary } from "./study-summary";

describe("today study summary", () => {
  it("includes only same-day timers and exercises", () => {
    const data = {
      ...initialData,
      studySessions: [{
        id: "today-session",
        date: "2026-06-13",
        title: "阅读",
        note: "",
        startedAt: "2026-06-13T01:00:00.000Z",
        endedAt: "2026-06-13T01:30:00.000Z",
        durationSeconds: 1800,
        source: "timer" as const
      }, {
        id: "old-session",
        date: "2026-06-12",
        title: "旧记录",
        note: "",
        startedAt: "2026-06-12T01:00:00.000Z",
        endedAt: "2026-06-12T01:30:00.000Z",
        durationSeconds: 1800,
        source: "timer" as const
      }],
      studyMetrics: [{
        id: "exercise",
        date: "2026-06-13",
        kind: "exercise" as const,
        title: "阅读题",
        count: 20,
        durationMinutes: 35,
        createdAt: "2026-06-13T02:00:00.000Z"
      }, {
        id: "words",
        date: "2026-06-13",
        kind: "words" as const,
        title: "单词",
        count: 100,
        durationMinutes: 20,
        createdAt: "2026-06-13T03:00:00.000Z"
      }],
      wordLearningRecords: [{
        id: "words-today",
        date: "2026-06-13",
        newWords: 24,
        reviewedWords: 60,
        note: "",
        owner: "ru" as const,
        createdAt: "2026-06-13T03:30:00.000Z"
      }],
      dailyTaskRecords: [{
        id: "study-task",
        owner: "ru" as const,
        date: "2026-06-13",
        title: "精读课文",
        group: "英语",
        unit: "次",
        target: 1,
        value: 1,
        completed: true,
        note: "",
        createdAt: "2026-06-13T04:00:00.000Z",
        updatedAt: "2026-06-13T04:20:00.000Z"
      }],
      todos: [{
        id: "todo",
        title: "不应进入总结",
        kind: "short" as const,
        startDate: "2026-06-13",
        completedDates: ["2026-06-13"],
        createdAt: "2026-06-13T00:00:00.000Z",
        updatedAt: "2026-06-13T00:00:00.000Z"
      }]
    };

    expect(buildTodayStudySummary(data, "2026-06-13")).toEqual([
      "阅读 30 分钟",
      "阅读题 20 道，用时 35 分钟",
      "新学 24 个单词，复习 60 个",
      "完成学习任务「精读课文」"
    ]);
    expect(buildTodayStudySummary(data, "2026-06-12")).toEqual(["旧记录 30 分钟"]);
    expect(studySummarySourceHash(data, "2026-06-13")).not.toContain("不应进入总结");
    expect(localStudySummaryText(["阅读 30 分钟"])).toContain("阅读 30 分钟");
  });

  it("stores only one summary per owner and date", () => {
    const first = {
      id: "summary-1",
      owner: "ru" as const,
      date: "2026-06-13",
      text: "旧总结",
      source: "local" as const,
      sourceHash: "old",
      generatedAt: "2026-06-13T10:00:00.000Z"
    };
    const next = { ...first, id: "summary-2", text: "新总结", sourceHash: "new" };
    expect(upsertDailyStudySummary([first], next)).toEqual([next]);
  });
});
