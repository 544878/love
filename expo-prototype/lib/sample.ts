import { localDate } from "../../src/date.ts";
import type { BackupData } from "../../src/types.ts";

const photo = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function exampleBackup(today = localDate()): BackupData {
  const morning = new Date(`${today}T09:12:00`).toISOString();
  const reply = new Date(`${today}T09:14:00`).toISOString();
  const allWeek = [0, 1, 2, 3, 4, 5, 6];
  return {
    version: 3,
    habits: [
      { id: "read", name: "读书", icon: "study", color: "#a83254", unit: "页", target: 20, days: allWeek, createdAt: morning },
      { id: "walk", name: "散步", icon: "run", color: "#2b6b55", unit: "分钟", target: 30, days: allWeek, createdAt: morning },
      { id: "stretch", name: "拉伸", icon: "fitness", color: "#a96b45", unit: "分钟", target: 10, days: allWeek, createdAt: morning }
    ],
    checkIns: [
      { id: `read-${today}`, habitId: "read", date: today, value: 20, note: "", completed: true, updatedAt: morning }
    ],
    reports: [
      {
        id: `report-${today}`, date: today, mood: "平静柔软", studyMinutes: 25,
        lifeNote: "上午读完了一章，傍晚想出去走走。", message: "", photoId: "example-photo", submittedAt: morning
      }
    ],
    knowledgeFiles: [],
    agentConversations: [],
    automations: [],
    automationRuns: [],
    dailyBriefs: [],
    studySessions: [],
    cloudOutbox: [],
    couplePosts: [],
    sharedCourses: [],
    feedWishes: [],
    coupleEvents: [],
    todos: [
      {
        id: "tomorrow-list", title: "整理明天的学习清单", kind: "short", startDate: today,
        completedDates: [], createdAt: morning, updatedAt: morning
      }
    ],
    coupleMessages: [
      { id: "example-message-1", author: "示例B", text: "傍晚去散步吗？", type: "text", createdAt: morning },
      { id: "example-message-2", author: "示例A", text: "好呀，读完这一章就出发。", type: "text", createdAt: reply }
    ],
    coupleGames: [],
    studyMetrics: [],
    wordLearningRecords: [],
    taskTemplates: [],
    dailyTaskRecords: [],
    dailyStudySummaries: [],
    customBadgeGifts: [],
    agentUiState: {
      agent: "english", chatDate: today, activeConversationId: "", questionDraft: "", imageTextDraft: ""
    },
    syncState: {
      enabled: false, configured: false, status: "signed-out", role: "member",
      schemaVersion: 3, lastPulledAtByClass: {}, pendingJobs: 0
    },
    settings: {
      onboarded: true, ownerName: "示例A", partnerName: "示例B", companionAlias: "",
      theme: "rose", currentWeightJin: 0, targetSchool: "", targetMajor: "",
      deepSeekApiKey: "", qwenApiKey: "", serperApiKey: ""
    },
    photos: { "example-photo": photo },
    exportedAt: reply
  };
}
