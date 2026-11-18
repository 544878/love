import { z } from "zod";
import { localDate } from "../../src/date.ts";
import { progressSchema, spaceIdSchema } from "./companion.ts";
import { eventSchema, postSchema, wishSchema } from "./shared-records.ts";

const settings = z.looseObject({
  onboarded: z.boolean().default(false),
  ownerName: z.string().default(""),
  partnerName: z.string().default(""),
  companionAlias: z.string().default(""),
  theme: z.enum(["rose", "peach", "sage"]).default("rose"),
  currentWeightJin: z.number().default(0),
  targetSchool: z.string().default(""),
  targetMajor: z.string().default("")
});

export const chatSchema = z.looseObject({
  id: z.string(),
  author: z.string(),
  text: z.string(),
  createdAt: z.string(),
  type: z.enum(["text", "image"]).optional(),
  photoId: z.string().optional(),
  gardenSpaceId: spaceIdSchema.optional()
});

const habit = z.looseObject({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  target: z.number(),
  days: z.array(z.number())
});

const checkIn = z.looseObject({
  id: z.string(),
  habitId: z.string(),
  date: z.string(),
  value: z.number(),
  completed: z.boolean()
});

const todo = z.looseObject({
  id: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string().optional(),
  completedDates: z.array(z.string())
});

const emptyCollection = z.array(z.unknown()).default([]);
const backupSchema = z.looseObject({
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.enum(["1", "2", "3"])]),
  habits: z.array(habit),
  checkIns: z.array(checkIn),
  reports: z.array(z.looseObject({ date: z.string(), lifeNote: z.string().optional() })),
  knowledgeFiles: emptyCollection,
  agentConversations: emptyCollection,
  automations: emptyCollection,
  automationRuns: emptyCollection,
  dailyBriefs: emptyCollection,
  studySessions: emptyCollection,
  cloudOutbox: emptyCollection,
  couplePosts: z.array(postSchema).default([]),
  sharedCourses: emptyCollection,
  feedWishes: z.array(wishSchema).default([]),
  coupleEvents: z.array(eventSchema).default([]),
  todos: z.array(todo).default([]),
  coupleMessages: z.array(chatSchema).default([]),
  coupleGames: emptyCollection,
  studyMetrics: emptyCollection,
  wordLearningRecords: emptyCollection,
  taskTemplates: emptyCollection,
  dailyTaskRecords: emptyCollection,
  dailyStudySummaries: emptyCollection,
  customBadgeGifts: emptyCollection,
  agentUiState: z.looseObject({
    agent: z.enum(["english", "food", "planner"]).default("english"),
    chatDate: z.string().optional(),
    activeConversationId: z.string().default(""),
    questionDraft: z.string().default(""),
    imageTextDraft: z.string().default("")
  }).prefault({}),
  syncState: z.looseObject({
    enabled: z.boolean().default(false),
    configured: z.boolean().default(false),
    status: z.string().default("signed-out"),
    lastPulledAtByClass: z.record(z.string(), z.string()).default({}),
    pendingJobs: z.number().default(0)
  }).prefault({}),
  settings: settings.prefault({}),
  photos: z.record(z.string(), z.string()).default({}),
  companions: z.record(spaceIdSchema, progressSchema).optional(),
  exportedAt: z.string().optional()
});

export function normalizeBackup(input: unknown) {
  const data = backupSchema.parse(input);
  return {
    ...data,
    version: 3,
    exportedAt: data.exportedAt ?? new Date().toISOString(),
    agentUiState: {
      ...data.agentUiState,
      chatDate: data.agentUiState.chatDate || localDate()
    },
    syncState: { ...data.syncState, role: "member", schemaVersion: 3 }
  };
}

export type StoredBackup = ReturnType<typeof normalizeBackup>;

export function readBackup(json: string): StoredBackup {
  return normalizeBackup(JSON.parse(json));
}

export function exportBackup(data: StoredBackup, timestamp = new Date().toISOString()): string {
  return JSON.stringify({
    ...data,
    settings: {
      ...data.settings,
      deepSeekApiKey: "",
      qwenApiKey: "",
      serperApiKey: ""
    },
    exportedAt: timestamp
  }, null, 2);
}
