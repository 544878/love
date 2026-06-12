/*
import AV from "leancloud-storage";
import type { AppData, SyncState } from "../types";

const RECORD_CLASS = "NanaRecord";
const SESSION_CLASS = "NanaStudySession";
const PHOTO_CLASS = "NanaPhoto";
const RECORD_KEY = "appData";

let initialized = false;

function envValue(name: string): string {
  return String((import.meta.env as Record<string, string | undefined>)[name] ?? "").trim();
}

export function isCloudConfigured(): boolean {
  return Boolean(envValue("VITE_LEANCLOUD_APP_ID") && envValue("VITE_LEANCLOUD_APP_KEY"));
}

export function initCloud(): boolean {
  if (initialized) return true;
  if (!isCloudConfigured()) return false;
  AV.init({
    appId: envValue("VITE_LEANCLOUD_APP_ID"),
    appKey: envValue("VITE_LEANCLOUD_APP_KEY"),
    serverURL: envValue("VITE_LEANCLOUD_SERVER_URL") || undefined
  });
  initialized = true;
  return true;
}

function currentUser(): AV.User | null {
  if (!initCloud()) return null;
  return AV.User.current();
}

function cloudSpaceId(data?: AppData): string {
  const user = currentUser();
  return data?.syncState?.spaceId?.trim() || user?.id || "local-space";
}

function syncState(patch: Partial<SyncState> = {}): SyncState {
  const user = currentUser();
  return {
    enabled: Boolean(user),
    configured: isCloudConfigured(),
    status: user ? "idle" : "signed-out",
    currentUser: user?.getUsername() || user?.id,
    spaceId: user?.id,
    pendingJobs: 0,
    ...patch
  };
}

export function getCloudState(): SyncState {
  if (!isCloudConfigured()) {
    return {
      enabled: false,
      configured: false,
      status: "signed-out",
      pendingJobs: 0
    };
  }
  return syncState();
}

export async function loginCloud(username: string, password: string, spaceId?: string): Promise<SyncState> {
  if (!initCloud()) throw new Error("LeanCloud 尚未配置，请先填写环境变量");
  const user = await AV.User.logIn(username.trim(), password);
  return syncState({
    enabled: true,
    status: "idle",
    currentUser: user.getUsername() || user.id,
    spaceId: spaceId?.trim() || user.id
  });
}

export async function logoutCloud(): Promise<SyncState> {
  if (initCloud()) await AV.User.logOut();
  return syncState({
    enabled: false,
    status: "signed-out",
    currentUser: undefined,
    spaceId: undefined
  });
}

export function queueSyncJob(data: AppData): AppData {
  return {
    ...data,
    syncState: {
      ...getCloudState(),
      ...(data.syncState ?? {}),
      pendingJobs: (data.syncState?.pendingJobs ?? 0) + 1,
      status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "idle"
    }
  };
}

async function findRecord(spaceId: string): Promise<AV.Object | undefined> {
  const query = new AV.Query(RECORD_CLASS);
  query.equalTo("key", RECORD_KEY);
  query.equalTo("spaceId", spaceId);
  return ((await query.first()) as AV.Object | undefined) ?? undefined;
}

export async function syncToCloud(data: AppData): Promise<AppData> {
  const user = currentUser();
  if (!user) {
    return {
      ...data,
      syncState: {
        ...(data.syncState ?? getCloudState()),
        configured: isCloudConfigured(),
        enabled: false,
        status: isCloudConfigured() ? "signed-out" : "failed",
        lastError: isCloudConfigured() ? "尚未登录 LeanCloud" : "LeanCloud 尚未配置"
      }
    };
  }

  try {
    const spaceId = cloudSpaceId(data);
    const record = (await findRecord(spaceId)) ?? new (AV.Object.extend(RECORD_CLASS))();
    record.set("key", RECORD_KEY);
    record.set("spaceId", spaceId);
    record.set("payload", {
      ...data,
      syncState: undefined,
      activeStudyTimer: data.activeStudyTimer
    });
    record.set("owner", user);
    record.set("updatedAtIso", new Date().toISOString());
    await record.save();

    await Promise.all((data.studySessions ?? []).map(async (session) => {
      const query = new AV.Query(SESSION_CLASS);
      query.equalTo("sessionId", session.id);
      query.equalTo("spaceId", spaceId);
      const object = (await query.first()) ?? new (AV.Object.extend(SESSION_CLASS))();
      object.set("sessionId", session.id);
      object.set("spaceId", spaceId);
      object.set("payload", session);
      object.set("durationSeconds", session.durationSeconds);
      object.set("date", session.date);
      object.set("owner", user);
      await object.save();
    }));

    return {
      ...data,
      studySessions: data.studySessions.map((item) => ({ ...item, syncStatus: "synced" })),
      syncState: syncState({
        enabled: true,
        status: "synced",
        spaceId,
        lastSyncedAt: new Date().toISOString(),
        lastError: undefined,
        pendingJobs: 0
      })
    };
  } catch (error) {
    return {
      ...data,
      syncState: {
        ...(data.syncState ?? getCloudState()),
        configured: isCloudConfigured(),
        enabled: true,
        status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "failed",
        lastError: error instanceof Error ? error.message : "LeanCloud 同步失败",
        pendingJobs: Math.max(1, data.syncState?.pendingJobs ?? 1)
      }
    };
  }
}

export async function pullFromCloud(localData: AppData): Promise<AppData> {
  const user = currentUser();
  if (!user) throw new Error("请先登录 LeanCloud");
  const spaceId = cloudSpaceId(localData);
  const record = await findRecord(spaceId);
  if (!record) {
    return {
      ...localData,
      syncState: syncState({
        enabled: true,
        status: "synced",
        spaceId,
        lastPulledAt: new Date().toISOString(),
        pendingJobs: localData.syncState?.pendingJobs ?? 0
      })
    };
  }
  const payload = record.get("payload") as AppData;
  return {
    ...payload,
    version: 2,
    syncState: syncState({
      enabled: true,
      status: "synced",
      spaceId,
      lastPulledAt: new Date().toISOString(),
      pendingJobs: 0
    })
  };
}

export async function uploadPhotoToCloud(id: string, dataUrl: string): Promise<void> {
  const user = currentUser();
  if (!user) return;
  try {
    const file = new AV.File(`${id}.jpg`, { base64: dataUrl });
    const saved = await file.save();
    const query = new AV.Query(PHOTO_CLASS);
    query.equalTo("photoId", id);
    const object = (await query.first()) ?? new (AV.Object.extend(PHOTO_CLASS))();
    object.set("photoId", id);
    object.set("file", saved);
    object.set("url", saved.url());
    object.set("owner", user);
    object.set("uploadedAt", new Date().toISOString());
    await object.save();
  } catch {
    // Photo upload is best-effort; the local IndexedDB copy is the source of truth.
  }
}
*/

import AV from "leancloud-storage";
import type {
  AgentConversation,
  AppData,
  AutomationRule,
  AutomationRun,
  CheckIn,
  CloudOutboxItem,
  CoupleEvent,
  CouplePost,
  DailyBrief,
  DailyReport,
  FeedWish,
  Habit,
  KnowledgeFile,
  SharedCourse,
  StudySession,
  SyncState
} from "../types";

const LEGACY_RECORD_CLASS = "NanaRecord";
const LEGACY_RECORD_KEY = "appData";
const LOVE_SPACE_CLASS = "LoveSpace";
const PHOTO_CLASS = "LovePhoto";
const SCHEMA_VERSION = 3;

type SyncRole = NonNullable<SyncState["role"]>;
type CloudCollectionKey =
  | "habits"
  | "checkIns"
  | "reports"
  | "studySessions"
  | "dailyBriefs"
  | "automations"
  | "automationRuns"
  | "knowledgeFiles"
  | "agentConversations"
  | "couplePosts"
  | "feedWishes"
  | "sharedCourses"
  | "coupleEvents";

type StudyStat = {
  id: string;
  date: string;
  studySeconds: number;
  reportStudyMinutes: number;
  updatedAt: string;
};

type CloudRecordPayload =
  | Habit
  | CheckIn
  | DailyReport
  | StudySession
  | DailyBrief
  | AutomationRule
  | AutomationRun
  | KnowledgeFile
  | AgentConversation
  | CouplePost
  | FeedWish
  | SharedCourse
  | CoupleEvent
  | StudyStat;

interface CloudClassConfig {
  key: CloudCollectionKey;
  className: string;
  supervisorRead: boolean;
  supervisorWrite: boolean;
}

const CLOUD_CLASSES: CloudClassConfig[] = [
  { key: "habits", className: "LoveHabit", supervisorRead: false, supervisorWrite: false },
  { key: "checkIns", className: "LoveCheckIn", supervisorRead: false, supervisorWrite: false },
  { key: "reports", className: "LoveDailyReport", supervisorRead: true, supervisorWrite: false },
  { key: "studySessions", className: "LoveStudySession", supervisorRead: false, supervisorWrite: false },
  { key: "dailyBriefs", className: "LoveDailyBrief", supervisorRead: false, supervisorWrite: false },
  { key: "automations", className: "LoveAutomationRule", supervisorRead: false, supervisorWrite: false },
  { key: "automationRuns", className: "LoveAutomationRun", supervisorRead: false, supervisorWrite: false },
  { key: "knowledgeFiles", className: "LoveKnowledgeFile", supervisorRead: false, supervisorWrite: false },
  { key: "agentConversations", className: "LoveAgentConversation", supervisorRead: false, supervisorWrite: false },
  { key: "couplePosts", className: "LoveCouplePost", supervisorRead: true, supervisorWrite: true },
  { key: "feedWishes", className: "LoveFeedWish", supervisorRead: true, supervisorWrite: true },
  { key: "sharedCourses", className: "LoveSharedCourse", supervisorRead: true, supervisorWrite: true },
  { key: "coupleEvents", className: "LoveCoupleEvent", supervisorRead: true, supervisorWrite: true }
];

const CLASS_BY_NAME = new Map(CLOUD_CLASSES.map((item) => [item.className, item]));

let initialized = false;

function envValue(name: string): string {
  return String((import.meta.env as Record<string, string | undefined>)[name] ?? "").trim();
}

export function isCloudConfigured(): boolean {
  return Boolean(envValue("VITE_LEANCLOUD_APP_ID") && envValue("VITE_LEANCLOUD_APP_KEY"));
}

export function initCloud(): boolean {
  if (initialized) return true;
  if (!isCloudConfigured()) return false;
  AV.init({
    appId: envValue("VITE_LEANCLOUD_APP_ID"),
    appKey: envValue("VITE_LEANCLOUD_APP_KEY"),
    serverURL: envValue("VITE_LEANCLOUD_SERVER_URL") || undefined
  });
  initialized = true;
  return true;
}

function currentUser(): AV.User | null {
  if (!initCloud()) return null;
  return AV.User.current();
}

function currentRole(data?: AppData): SyncRole {
  return data?.syncState?.role ?? "owner";
}

function cloudSpaceId(data?: AppData): string {
  const user = currentUser();
  return data?.syncState?.spaceId?.trim() || user?.id || "local-space";
}

function syncState(patch: Partial<SyncState> = {}): SyncState {
  const user = currentUser();
  return {
    enabled: Boolean(user),
    configured: isCloudConfigured(),
    status: user ? "idle" : "signed-out",
    role: "owner",
    currentUser: user?.getUsername() || user?.id,
    spaceId: user?.id,
    schemaVersion: SCHEMA_VERSION,
    lastPulledAtByClass: {},
    pendingJobs: 0,
    ...patch
  };
}

export function getCloudState(): SyncState {
  if (!isCloudConfigured()) {
    return {
      enabled: false,
      configured: false,
      status: "signed-out",
      role: "owner",
      schemaVersion: SCHEMA_VERSION,
      lastPulledAtByClass: {},
      pendingJobs: 0
    };
  }
  return syncState();
}

export async function loginCloud(username: string, password: string, spaceId?: string, role: SyncRole = "owner"): Promise<SyncState> {
  if (!initCloud()) throw new Error("LeanCloud is not configured");
  const user = await AV.User.logIn(username.trim(), password);
  return syncState({
    enabled: true,
    status: "idle",
    role,
    currentUser: user.getUsername() || user.id,
    spaceId: spaceId?.trim() || user.id,
    schemaVersion: SCHEMA_VERSION
  });
}

export async function logoutCloud(): Promise<SyncState> {
  if (initCloud()) await AV.User.logOut();
  return syncState({
    enabled: false,
    status: "signed-out",
    currentUser: undefined,
    spaceId: undefined
  });
}

function canWriteClass(config: CloudClassConfig, role: SyncRole): boolean {
  return role === "owner" || config.supervisorWrite;
}

function visibleClasses(role: SyncRole): CloudClassConfig[] {
  return CLOUD_CLASSES.filter((config) => role === "owner" || config.supervisorRead);
}

function payloadUpdatedAt(payload: CloudRecordPayload): string {
  const value = payload as Record<string, unknown>;
  return String(value.updatedAt ?? value.submittedAt ?? value.generatedAt ?? value.createdAt ?? new Date().toISOString());
}

function cloudPayload(payload: CloudRecordPayload, user: AV.User, spaceId: string, deletedAtIso?: string) {
  return {
    ...payload,
    spaceId,
    createdBy: String((payload as Record<string, unknown>).createdBy ?? user.id ?? user.getUsername() ?? "unknown"),
    updatedAtIso: deletedAtIso ?? payloadUpdatedAt(payload),
    deletedAtIso,
    revision: Number((payload as Record<string, unknown>).revision ?? 0) + 1
  };
}

function collectionItems(data: AppData, key: CloudCollectionKey): CloudRecordPayload[] {
  return [...((data[key] ?? []) as CloudRecordPayload[])];
}

function buildStudyStats(data: AppData): StudyStat[] {
  const dates = new Set<string>();
  data.reports.forEach((report) => dates.add(report.date));
  data.studySessions.forEach((session) => dates.add(session.date));
  return [...dates].map((date) => {
    const studySeconds = data.studySessions.filter((session) => session.date === date).reduce((sum, session) => sum + session.durationSeconds, 0);
    const reportStudyMinutes = data.reports.find((report) => report.date === date)?.studyMinutes ?? 0;
    return {
      id: `study-stat-${date}`,
      date,
      studySeconds: studySeconds || reportStudyMinutes * 60,
      reportStudyMinutes,
      updatedAt: new Date().toISOString()
    };
  });
}

function buildOutbox(data: AppData): CloudOutboxItem[] {
  const queuedAt = new Date().toISOString();
  const role = currentRole(data);
  const rows = CLOUD_CLASSES.flatMap((config) => {
    if (!canWriteClass(config, role)) return [];
    return collectionItems(data, config.key).map((payload) => ({
      id: `${config.className}:${String((payload as Record<string, unknown>).id)}:${queuedAt}`,
      className: config.className,
      recordId: String((payload as Record<string, unknown>).id),
      payload,
      queuedAt
    }));
  });
  if (role === "owner") {
    rows.push(...buildStudyStats(data).map((payload) => ({
      id: `LoveStudyStat:${payload.id}:${queuedAt}`,
      className: "LoveStudyStat",
      recordId: payload.id,
      payload,
      queuedAt
    })));
  }
  return rows;
}

export function queueSyncJob(data: AppData): AppData {
  return {
    ...data,
    cloudOutbox: buildOutbox(data),
    syncState: {
      ...getCloudState(),
      ...(data.syncState ?? {}),
      schemaVersion: SCHEMA_VERSION,
      pendingJobs: (data.syncState?.pendingJobs ?? 0) + 1,
      status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "idle"
    }
  };
}

async function firstByField(className: string, field: string, value: string): Promise<AV.Object | undefined> {
  const query = new AV.Query(className);
  query.equalTo(field, value);
  return ((await query.first()) as AV.Object | undefined) ?? undefined;
}

async function findLegacyRecord(spaceId: string): Promise<AV.Object | undefined> {
  const query = new AV.Query(LEGACY_RECORD_CLASS);
  query.equalTo("key", LEGACY_RECORD_KEY);
  query.equalTo("spaceId", spaceId);
  return ((await query.first()) as AV.Object | undefined) ?? undefined;
}

function sanitizeSettings(settings: AppData["settings"]): AppData["settings"] {
  const safeSettings = { ...settings };
  safeSettings.deepSeekApiKey = "";
  safeSettings.qwenApiKey = "";
  safeSettings.serperApiKey = "";
  return safeSettings;
}

export async function ensureLoveSpace(dataOrRole?: AppData | SyncRole, maybeRole?: SyncRole): Promise<SyncState> {
  const user = currentUser();
  if (!user) throw new Error("Please log in to LeanCloud first");
  const data = typeof dataOrRole === "object" ? dataOrRole : undefined;
  const role = (typeof dataOrRole === "string" ? dataOrRole : maybeRole) ?? currentRole(data);
  const spaceId = cloudSpaceId(data);
  const object = (await firstByField(LOVE_SPACE_CLASS, "spaceId", spaceId)) ?? new (AV.Object.extend(LOVE_SPACE_CLASS))();
  object.set("spaceId", spaceId);
  object.set("name", "LoveLog");
  object.set("schemaVersion", SCHEMA_VERSION);
  object.set(role === "supervisor" ? "supervisor" : "owner", user);
  object.set("updatedAtIso", new Date().toISOString());
  await object.save();
  return syncState({
    enabled: true,
    status: "idle",
    role,
    spaceId,
    schemaVersion: SCHEMA_VERSION,
    lastPulledAtByClass: data?.syncState?.lastPulledAtByClass ?? {}
  });
}

async function saveOutboxItem(item: CloudOutboxItem, user: AV.User, spaceId: string): Promise<void> {
  const object = (await firstByField(item.className, "id", item.recordId)) ?? new (AV.Object.extend(item.className))();
  const payload = cloudPayload(item.payload as CloudRecordPayload, user, spaceId, item.deletedAtIso);
  object.set("id", item.recordId);
  object.set("spaceId", spaceId);
  object.set("payload", payload);
  object.set("createdBy", payload.createdBy);
  object.set("updatedAtIso", payload.updatedAtIso);
  object.set("deletedAtIso", payload.deletedAtIso);
  object.set("revision", payload.revision);
  object.set("owner", user);
  await object.save();
}

export async function pushOutbox(data: AppData): Promise<AppData> {
  const user = currentUser();
  if (!user) {
    return {
      ...data,
      syncState: {
        ...(data.syncState ?? getCloudState()),
        configured: isCloudConfigured(),
        enabled: false,
        status: isCloudConfigured() ? "signed-out" : "failed",
        schemaVersion: SCHEMA_VERSION,
        lastError: isCloudConfigured() ? "尚未登录 LeanCloud" : "LeanCloud 尚未配置"
      }
    };
  }

  try {
    const spaceId = cloudSpaceId(data);
    const role = currentRole(data);
    await ensureLoveSpace(data);
    const outbox = data.cloudOutbox?.length ? data.cloudOutbox : buildOutbox(data);
    await Promise.all(outbox.filter((item) => {
      if (item.className === "LoveStudyStat") return role === "owner";
      const config = CLASS_BY_NAME.get(item.className);
      return Boolean(config && canWriteClass(config, role));
    }).map((item) => saveOutboxItem(item, user, spaceId)));

    return {
      ...data,
      studySessions: data.studySessions.map((item) => ({ ...item, syncStatus: "synced" })),
      cloudOutbox: [],
      syncState: syncState({
        enabled: true,
        status: "synced",
        role,
        spaceId,
        schemaVersion: SCHEMA_VERSION,
        lastPulledAtByClass: data.syncState?.lastPulledAtByClass ?? {},
        lastSyncedAt: new Date().toISOString(),
        lastError: undefined,
        pendingJobs: 0
      })
    };
  } catch (error) {
    return {
      ...data,
      syncState: {
        ...(data.syncState ?? getCloudState()),
        configured: isCloudConfigured(),
        enabled: true,
        status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "failed",
        schemaVersion: SCHEMA_VERSION,
        lastError: error instanceof Error ? error.message : "LeanCloud 同步失败",
        pendingJobs: Math.max(1, data.syncState?.pendingJobs ?? 1)
      }
    };
  }
}

function mergeRecords<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  local.forEach((item) => map.set(item.id, item));
  remote.forEach((item) => {
    const payload = item as T & { deletedAtIso?: string };
    if (payload.deletedAtIso) {
      map.delete(item.id);
    } else {
      map.set(item.id, item);
    }
  });
  return [...map.values()];
}

async function fetchPayloads(className: string, spaceId: string, since?: string): Promise<{ payloads: CloudRecordPayload[]; latest?: string }> {
  const query = new AV.Query(className);
  query.equalTo("spaceId", spaceId);
  if (since) query.greaterThan("updatedAtIso", since);
  query.ascending("updatedAtIso");
  query.limit(1000);
  const rows = await query.find();
  let latest = since;
  const payloads = rows.map((row) => {
    const updatedAtIso = String(row.get("updatedAtIso") ?? "");
    if (updatedAtIso && (!latest || updatedAtIso > latest)) latest = updatedAtIso;
    return row.get("payload") as CloudRecordPayload;
  });
  return { payloads, latest };
}

export async function pullCloudChanges(localData: AppData): Promise<AppData> {
  const user = currentUser();
  if (!user) throw new Error("请先登录 LeanCloud");
  const spaceId = cloudSpaceId(localData);
  const role = currentRole(localData);
  const cursors = { ...(localData.syncState?.lastPulledAtByClass ?? {}) };
  let nextData = { ...localData };
  let received = false;

  for (const config of visibleClasses(role)) {
    const { payloads, latest } = await fetchPayloads(config.className, spaceId, cursors[config.className]);
    if (payloads.length) {
      received = true;
      nextData = {
        ...nextData,
        [config.key]: mergeRecords(nextData[config.key] as Array<{ id: string }>, payloads as Array<{ id: string }>)
      };
    }
    if (latest) cursors[config.className] = latest;
  }

  const { payloads: stats, latest: statsLatest } = await fetchPayloads("LoveStudyStat", spaceId, cursors.LoveStudyStat);
  if (stats.length) received = true;
  if (statsLatest) cursors.LoveStudyStat = statsLatest;

  if (!received) {
    const legacy = await findLegacyRecord(spaceId);
    if (legacy) nextData = { ...nextData, ...(legacy.get("payload") as AppData) };
  }

  return {
    ...nextData,
    version: 2,
    settings: {
      ...nextData.settings,
      deepSeekApiKey: localData.settings.deepSeekApiKey,
      qwenApiKey: localData.settings.qwenApiKey,
      serperApiKey: localData.settings.serperApiKey
    },
    syncState: syncState({
      enabled: true,
      status: "synced",
      role,
      spaceId,
      schemaVersion: SCHEMA_VERSION,
      lastPulledAtByClass: cursors,
      lastPulledAt: new Date().toISOString(),
      pendingJobs: 0
    })
  };
}

export async function syncNow(data: AppData): Promise<AppData> {
  const pushed = await pushOutbox({
    ...data,
    settings: sanitizeSettings(data.settings)
  });
  if (pushed.syncState?.status !== "synced") return pushed;
  return pullCloudChanges({
    ...pushed,
    settings: data.settings
  });
}

export async function syncToCloud(data: AppData): Promise<AppData> {
  return pushOutbox(data);
}

export async function pullFromCloud(localData: AppData): Promise<AppData> {
  return pullCloudChanges(localData);
}

export async function uploadPhotoToCloud(id: string, dataUrl: string): Promise<void> {
  const user = currentUser();
  if (!user) return;
  try {
    const file = new AV.File(`${id}.jpg`, { base64: dataUrl });
    const saved = await file.save();
    const query = new AV.Query(PHOTO_CLASS);
    query.equalTo("photoId", id);
    query.equalTo("spaceId", user.id);
    const object = (await query.first()) ?? new (AV.Object.extend(PHOTO_CLASS))();
    object.set("photoId", id);
    object.set("id", id);
    object.set("spaceId", user.id);
    object.set("file", saved);
    object.set("url", saved.url());
    object.set("module", "photo");
    object.set("owner", user);
    object.set("createdBy", user.id);
    object.set("updatedAtIso", new Date().toISOString());
    object.set("uploadedAt", new Date().toISOString());
    await object.save();
  } catch {
    // Photo upload is best-effort; the local IndexedDB copy is still usable offline.
  }
}

export async function getCloudPhotoUrl(id?: string): Promise<string | undefined> {
  const user = currentUser();
  if (!user || !id) return undefined;
  try {
    const query = new AV.Query(PHOTO_CLASS);
    query.equalTo("photoId", id);
    const object = await query.first();
    return object?.get("url") as string | undefined;
  } catch {
    return undefined;
  }
}
