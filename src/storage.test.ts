import { describe, expect, it } from "vitest";
import { initialData } from "./data";
import { normalizeAppData } from "./storage";
import { queueSyncJob } from "./.private/cloud";

describe("v3 storage migration", () => {
  it("migrates v1-shaped data into v3 equal-member data", () => {
    const migrated = normalizeAppData({
      version: 1,
      habits: initialData.habits,
      checkIns: [],
      reports: [],
      settings: { ...initialData.settings, onboarded: true }
    });

    expect(migrated.version).toBe(3);
    expect(migrated.studySessions).toEqual([]);
    expect(migrated.agentUiState?.agent).toBe("english");
    expect(migrated.syncState?.pendingJobs).toBe(0);
    expect(migrated.syncState?.schemaVersion).toBe(3);
    expect(migrated.syncState?.role).toBe("member");
    expect(migrated.taskTemplates).toEqual([]);
    expect(migrated.dailyTaskRecords).toEqual([]);
    expect(migrated.dailyStudySummaries).toEqual([]);
    expect(migrated.customBadgeGifts).toEqual([]);
    expect(migrated.wordLearningRecords).toEqual([]);
    expect(migrated.cloudOutbox).toEqual([]);
    expect(migrated.settings.onboarded).toBe(true);
  });

  it("keeps a local sync queue count when cloud work is pending", () => {
    const queued = queueSyncJob({
      ...initialData,
      syncState: {
        enabled: true,
        configured: true,
        status: "idle",
        pendingJobs: 1
      }
    });

    expect(queued.syncState?.pendingJobs).toBe(2);
    expect(["idle", "offline"]).toContain(queued.syncState?.status);
  });

  it("keeps legacy couple posts compatible without social fields", () => {
    const migrated = normalizeAppData({
      ...initialData,
      couplePosts: [{
        id: "legacy-post",
        author: "陶陶",
        text: "旧动态",
        date: "2026-06-08",
        createdAt: "2026-06-08T12:00:00.000Z"
      }]
    });

    expect(migrated.couplePosts[0]).toMatchObject({
      id: "legacy-post",
      author: "陶陶",
      text: "旧动态"
    });
    expect(migrated.couplePosts[0].photoIds).toBeUndefined();
    expect(migrated.couplePosts[0].likes).toBeUndefined();
    expect(migrated.couplePosts[0].comments).toBeUndefined();
  });

  it("queues owner-writable LoveLog records without local-only API keys", () => {
    const queued = queueSyncJob({
      ...initialData,
      reports: [{
        id: "report-1",
        date: "2026-06-08",
        mood: initialData.reports[0]?.mood ?? "元气满满" as never,
        studyMinutes: 30,
        lifeNote: "ok",
        message: "done",
        submittedAt: "2026-06-08T12:00:00.000Z"
      }],
      couplePosts: [{
        id: "post-1",
        author: "me",
        authorProfile: "ru",
        text: "hello",
        photoIds: ["post-photo-1"],
        likes: ["taotao"],
        comments: [{
          id: "comment-1",
          authorProfile: "taotao",
          author: "陶陶",
          text: "好看",
          createdAt: "2026-06-08T12:01:00.000Z"
        }],
        date: "2026-06-08",
        createdAt: "2026-06-08T12:00:00.000Z"
      }],
      settings: {
        ...initialData.settings,
        deepSeekApiKey: "secret-deepseek",
        qwenApiKey: "secret-qwen",
        serperApiKey: "secret-serper"
      },
      syncState: {
        enabled: true,
        configured: true,
        status: "idle",
        role: "owner",
        schemaVersion: 3,
        lastPulledAtByClass: {},
        pendingJobs: 0
      }
    });

    const serialized = JSON.stringify(queued.cloudOutbox);
    expect(queued.cloudOutbox?.some((item) => item.className === "LoveDailyReport")).toBe(true);
    expect(queued.cloudOutbox?.some((item) => item.className === "LoveCouplePost")).toBe(true);
    expect(queued.cloudOutbox?.some((item) => item.className === "LoveStudyStat")).toBe(true);
    expect(serialized).toContain("post-photo-1");
    expect(serialized).toContain("comment-1");
    expect(serialized).not.toContain("secret-deepseek");
    expect(serialized).not.toContain("secret-qwen");
    expect(serialized).not.toContain("secret-serper");
  });

  it("migrates a legacy supervisor to an equal member with full writes", () => {
    const queued = queueSyncJob({
      ...initialData,
      reports: [{
        id: "report-1",
        date: "2026-06-08",
        mood: initialData.reports[0]?.mood ?? "元气满满" as never,
        studyMinutes: 30,
        lifeNote: "private",
        message: "private",
        submittedAt: "2026-06-08T12:00:00.000Z"
      }],
      feedWishes: [{
        id: "feed-1",
        author: "supervisor",
        craving: "tea",
        note: "",
        priority: "want",
        date: "2026-06-08",
        fulfilled: false,
        createdAt: "2026-06-08T12:00:00.000Z",
        updatedAt: "2026-06-08T12:00:00.000Z"
      }],
      syncState: {
        enabled: true,
        configured: true,
        status: "idle",
        role: "supervisor",
        schemaVersion: 3,
        lastPulledAtByClass: {},
        pendingJobs: 0
      }
    });

    expect(queued.cloudOutbox?.some((item) => item.className === "LoveFeedWish")).toBe(true);
    expect(queued.cloudOutbox?.some((item) => item.className === "LoveDailyReport")).toBe(true);
    expect(queued.cloudOutbox?.some((item) => item.className === "LoveStudyStat")).toBe(true);
  });
});
