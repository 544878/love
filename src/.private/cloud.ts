import type {
  AgentConversation, AppData, AutomationRule, AutomationRun, CheckIn, CloudOutboxItem,
  CoupleChatMessage, CoupleEvent, CouplePost, CustomBadgeGift, DailyBrief,
  DailyReport, DailyStudySummary, DailyTaskRecord, FeedWish, Habit, KnowledgeFile, SharedCourse, StudyMetric,
  StudySession, SyncState, TaskTemplate, TodoItem, WordLearningRecord
} from "../types";

const SCHEMA_VERSION = 3;
const TOKEN_KEY = "lovelog.cloud.token";
const SESSION_KEY = "lovelog.cloud.session";

type SyncRole = NonNullable<SyncState["role"]>;
type CloudCollectionKey =
  | "habits" | "checkIns" | "reports" | "studySessions" | "dailyBriefs"
  | "automations" | "automationRuns" | "knowledgeFiles" | "agentConversations"
  | "couplePosts" | "feedWishes" | "sharedCourses" | "coupleEvents"
  | "todos" | "coupleMessages" | "studyMetrics"
  | "wordLearningRecords" | "taskTemplates" | "dailyTaskRecords" | "dailyStudySummaries" | "customBadgeGifts";
type StudyStat = { id: string; date: string; studySeconds: number; reportStudyMinutes: number; updatedAt: string };
type CloudRecordPayload =
  | Habit | CheckIn | DailyReport | StudySession | DailyBrief | AutomationRule | AutomationRun
  | KnowledgeFile | AgentConversation | CouplePost | FeedWish | SharedCourse | CoupleEvent
  | TodoItem | CoupleChatMessage | StudyMetric | WordLearningRecord | TaskTemplate
  | DailyTaskRecord | DailyStudySummary | CustomBadgeGift | StudyStat;
type CloudClassConfig = {
  key: CloudCollectionKey;
  className: string;
};
type CloudSession = {
  currentUser: string;
  spaceId: string;
  role: SyncRole;
  inviteCode?: string;
};

const CLOUD_CLASSES: CloudClassConfig[] = [
  { key: "habits", className: "LoveHabit" },
  { key: "checkIns", className: "LoveCheckIn" },
  { key: "reports", className: "LoveDailyReport" },
  { key: "studySessions", className: "LoveStudySession" },
  { key: "dailyBriefs", className: "LoveDailyBrief" },
  { key: "automations", className: "LoveAutomationRule" },
  { key: "automationRuns", className: "LoveAutomationRun" },
  { key: "knowledgeFiles", className: "LoveKnowledgeFile" },
  { key: "agentConversations", className: "LoveAgentConversation" },
  { key: "couplePosts", className: "LoveCouplePost" },
  { key: "feedWishes", className: "LoveFeedWish" },
  { key: "sharedCourses", className: "LoveSharedCourse" },
  { key: "coupleEvents", className: "LoveCoupleEvent" },
  { key: "todos", className: "LoveTodo" },
  { key: "coupleMessages", className: "LoveChatMessage" },
  { key: "studyMetrics", className: "LoveStudyMetric" },
  { key: "wordLearningRecords", className: "LoveWordLearningRecord" },
  { key: "taskTemplates", className: "LoveTaskTemplate" },
  { key: "dailyTaskRecords", className: "LoveDailyTaskRecord" },
  { key: "dailyStudySummaries", className: "LoveDailyStudySummary" },
  { key: "customBadgeGifts", className: "LoveBadgeGift" }
];
const CLASS_BY_NAME = new Map(CLOUD_CLASSES.map((item) => [item.className, item]));

function envValue(name: string): string {
  return String((import.meta.env as Record<string, string | undefined>)[name] ?? "").trim();
}

function apiBase(): string {
  return (envValue("VITE_CLOUD_API_URL") || "/api").replace(/\/+$/, "");
}

function storageAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readToken(): string | undefined {
  return storageAvailable() ? window.localStorage.getItem(TOKEN_KEY) ?? undefined : undefined;
}

function readSession(): CloudSession | undefined {
  if (!storageAvailable()) return undefined;
  try {
    const value = window.localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) as CloudSession : undefined;
  } catch {
    return undefined;
  }
}

function saveSession(token: string, session: CloudSession): void {
  if (!storageAvailable()) return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession(): void {
  if (!storageAvailable()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(SESSION_KEY);
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isCloudConfigured()) throw new Error("阿里云同步服务尚未配置");
  const token = readToken();
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error(payload.error || `云端请求失败（${response.status}）`);
  }
  return payload as T;
}

export function isCloudConfigured(): boolean {
  return Boolean(apiBase());
}

export function initCloud(): boolean {
  return isCloudConfigured();
}

function syncState(patch: Partial<SyncState> = {}): SyncState {
  const session = readSession();
  return {
    enabled: Boolean(session && readToken()),
    configured: isCloudConfigured(),
    status: session && readToken() ? "idle" : "signed-out",
    role: "member",
    currentUser: session?.currentUser,
    spaceId: session?.spaceId,
    inviteCode: session?.inviteCode,
    schemaVersion: SCHEMA_VERSION,
    lastPulledAtByClass: {},
    pendingJobs: 0,
    ...patch
  };
}

export function getCloudState(): SyncState {
  return syncState();
}

export async function loginCloud(
  username: string,
  password: string,
  spaceId?: string,
  role: SyncRole = "member",
  inviteCode?: string
): Promise<SyncState> {
  const result = await apiRequest<{
    token: string;
    user: { username: string };
    space: { id: string; role: SyncRole; inviteCode?: string };
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: username.trim(), password, spaceId: spaceId?.trim() || undefined, role, inviteCode: inviteCode?.trim() || undefined })
  });
  const session: CloudSession = {
    currentUser: result.user.username,
    spaceId: result.space.id,
    role: result.space.role,
    inviteCode: result.space.inviteCode
  };
  saveSession(result.token, session);
  return syncState({ enabled: true, status: "idle", ...session });
}

export async function logoutCloud(): Promise<SyncState> {
  try {
    if (readToken()) await apiRequest("/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // Local logout must still work while the server is unavailable.
  }
  clearSession();
  return syncState({ enabled: false, status: "signed-out", currentUser: undefined, spaceId: undefined, inviteCode: undefined });
}

function currentRole(data?: AppData): SyncRole {
  return data?.syncState?.role ?? readSession()?.role ?? "member";
}

function cloudSpaceId(data?: AppData): string {
  return data?.syncState?.spaceId?.trim() || readSession()?.spaceId || "";
}

function canWriteClass(config: CloudClassConfig, role: SyncRole): boolean {
  void config;
  void role;
  return true;
}

function visibleClasses(role: SyncRole): CloudClassConfig[] {
  void role;
  return CLOUD_CLASSES;
}

function collectionItems(data: AppData, key: CloudCollectionKey): CloudRecordPayload[] {
  if (key === "coupleMessages") {
    return data.coupleMessages.map((item) => ({ ...item, status: "synced" as const }));
  }
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
      id: `${config.className}:${String((payload as { id: string }).id)}:${queuedAt}`,
      className: config.className,
      recordId: String((payload as { id: string }).id),
      payload,
      queuedAt
    }));
  });
  rows.push(...buildStudyStats(data).map((payload) => ({
    id: `LoveStudyStat:${payload.id}:${queuedAt}`,
    className: "LoveStudyStat",
    recordId: payload.id,
    payload,
    queuedAt
  })));
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

function sanitizeSettings(settings: AppData["settings"]): AppData["settings"] {
  return { ...settings, deepSeekApiKey: "", qwenApiKey: "", serperApiKey: "" };
}

export async function ensureLoveSpace(dataOrRole?: AppData | SyncRole, maybeRole?: SyncRole): Promise<SyncState> {
  const data = typeof dataOrRole === "object" ? dataOrRole : undefined;
  const role = (typeof dataOrRole === "string" ? dataOrRole : maybeRole) ?? currentRole(data);
  const result = await apiRequest<{ space: { id: string; role: SyncRole; inviteCode?: string } }>("/spaces/ensure", {
    method: "POST",
    body: JSON.stringify({ spaceId: cloudSpaceId(data), role })
  });
  const session = readSession();
  const token = readToken();
  if (!session || !token) throw new Error("请先登录阿里云同步服务");
  const nextSession = { ...session, spaceId: result.space.id, role: result.space.role, inviteCode: result.space.inviteCode };
  saveSession(token, nextSession);
  return syncState({ enabled: true, status: "idle", ...nextSession });
}

export async function pushOutbox(data: AppData): Promise<AppData> {
  if (!readToken()) {
    return {
      ...data,
      syncState: {
        ...(data.syncState ?? getCloudState()),
        configured: isCloudConfigured(),
        enabled: false,
        status: isCloudConfigured() ? "signed-out" : "failed",
        schemaVersion: SCHEMA_VERSION,
        lastError: isCloudConfigured() ? "尚未登录阿里云同步服务" : "阿里云同步服务尚未配置"
      }
    };
  }
  try {
    const spaceId = cloudSpaceId(data);
    const role = currentRole(data);
    const outbox = data.cloudOutbox?.length ? data.cloudOutbox : buildOutbox(data);
    await apiRequest("/sync/push", {
      method: "POST",
      body: JSON.stringify({
        spaceId,
        records: outbox.filter((item) => {
          if (item.className === "LoveStudyStat") return true;
          const config = CLASS_BY_NAME.get(item.className);
          return Boolean(config && canWriteClass(config, role));
        })
      })
    });
    return {
      ...data,
      studySessions: data.studySessions.map((item) => ({ ...item, syncStatus: "synced" })),
      coupleMessages: data.coupleMessages.map((item) => item.status === "sending" ? { ...item, status: "synced" as const } : item),
      cloudOutbox: [],
      syncState: syncState({
        enabled: true,
        status: "synced",
        role,
        spaceId,
        lastPulledAtByClass: data.syncState?.lastPulledAtByClass ?? {},
        lastSyncedAt: new Date().toISOString(),
        lastError: undefined,
        pendingJobs: 0
      })
    };
  } catch (error) {
    return {
      ...data,
      coupleMessages: data.coupleMessages.map((item) => item.status === "sending" ? { ...item, status: "failed" as const } : item),
      syncState: {
        ...(data.syncState ?? getCloudState()),
        configured: isCloudConfigured(),
        enabled: true,
        status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "failed",
        schemaVersion: SCHEMA_VERSION,
        lastError: error instanceof Error ? error.message : "阿里云同步失败",
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
    if (payload.deletedAtIso) map.delete(item.id);
    else map.set(item.id, item);
  });
  return [...map.values()];
}

export async function pullCloudChanges(localData: AppData): Promise<AppData> {
  if (!readToken()) throw new Error("请先登录阿里云同步服务");
  const spaceId = cloudSpaceId(localData);
  const role = currentRole(localData);
  const cursors = { ...(localData.syncState?.lastPulledAtByClass ?? {}) };
  const result = await apiRequest<{ collections: Record<string, { payloads: CloudRecordPayload[]; latest?: string }> }>("/sync/pull", {
    method: "POST",
    body: JSON.stringify({ spaceId, cursors })
  });
  let nextData = { ...localData };
  for (const config of visibleClasses(role)) {
    const collection = result.collections[config.className];
    if (!collection) continue;
    if (collection.payloads.length) {
      nextData = {
        ...nextData,
        [config.key]: mergeRecords(nextData[config.key] as Array<{ id: string }>, collection.payloads as Array<{ id: string }>)
      };
    }
    if (collection.latest) cursors[config.className] = collection.latest;
  }
  const stats = result.collections.LoveStudyStat;
  if (stats?.latest) cursors.LoveStudyStat = stats.latest;
  return {
    ...nextData,
    version: 3,
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
      lastPulledAtByClass: cursors,
      lastPulledAt: new Date().toISOString(),
      pendingJobs: 0
    })
  };
}

export async function syncNow(data: AppData): Promise<AppData> {
  const pushed = await pushOutbox({ ...data, settings: sanitizeSettings(data.settings) });
  if (pushed.syncState?.status !== "synced") return pushed;
  return pullCloudChanges({ ...pushed, settings: data.settings });
}

export async function syncToCloud(data: AppData): Promise<AppData> {
  return pushOutbox(data);
}

export async function pullFromCloud(localData: AppData): Promise<AppData> {
  return pullCloudChanges(localData);
}

export async function uploadPhotoToCloud(id: string, dataUrl: string): Promise<void> {
  if (!readToken()) return;
  try {
    await apiRequest("/photos", {
      method: "POST",
      body: JSON.stringify({ spaceId: readSession()?.spaceId, id, dataUrl })
    });
  } catch {
    // Photo upload is best-effort; IndexedDB remains the local source of truth.
  }
}

export async function getCloudPhotoUrl(id?: string): Promise<string | undefined> {
  if (!readToken() || !id) return undefined;
  try {
    const spaceId = encodeURIComponent(readSession()?.spaceId ?? "");
    const result = await apiRequest<{ dataUrl?: string }>(`/photos/${encodeURIComponent(id)}?spaceId=${spaceId}`);
    return result.dataUrl;
  } catch {
    return undefined;
  }
}
