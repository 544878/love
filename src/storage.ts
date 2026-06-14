import { defaultAutomations, initialData } from "./data";
import { localDate } from "./date";
import { getCloudPhotoUrl, uploadPhotoToCloud } from "./.private/cloud";
import type { AgentKind, AppData, BackupData } from "./types";

const DATA_KEY_V1 = "bloom-together-data-v1";
const DATA_KEY_V2 = "bloom-together-data-v2";
const DB_NAME = "bloom-together-photos";
const PHOTO_STORE = "photos";
const DATA_STORE = "appData";
const DATA_ID = "current";

type StoredAppData = Partial<Omit<AppData, "version">> & { version?: number };

function canUseLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

export function normalizeAppData(value: unknown): AppData {
  const parsed = (value && typeof value === "object" ? value : {}) as StoredAppData;
  const agentUiState = parsed.agentUiState ?? {
    agent: "english" as AgentKind,
    chatDate: localDate(),
    activeConversationId: "",
    questionDraft: "",
    imageTextDraft: ""
  };
  return {
    ...structuredClone(initialData),
    ...parsed,
    version: 3,
    habits: parsed.habits ?? structuredClone(initialData.habits),
    checkIns: parsed.checkIns ?? [],
    reports: parsed.reports ?? [],
    knowledgeFiles: parsed.knowledgeFiles ?? [],
    agentConversations: parsed.agentConversations ?? [],
    automations: parsed.automations ?? structuredClone(defaultAutomations),
    automationRuns: parsed.automationRuns ?? [],
    dailyBriefs: parsed.dailyBriefs ?? [],
    studySessions: parsed.studySessions ?? [],
    activeStudyTimer: parsed.activeStudyTimer,
    cloudOutbox: parsed.cloudOutbox ?? [],
    couplePosts: parsed.couplePosts ?? [],
    sharedCourses: parsed.sharedCourses ?? [],
    feedWishes: parsed.feedWishes ?? [],
    coupleEvents: parsed.coupleEvents ?? [],
    todos: parsed.todos ?? [],
    coupleMessages: parsed.coupleMessages ?? [],
    coupleGames: parsed.coupleGames ?? [],
    studyMetrics: parsed.studyMetrics ?? [],
    wordLearningRecords: parsed.wordLearningRecords ?? [],
    taskTemplates: parsed.taskTemplates ?? [],
    dailyTaskRecords: parsed.dailyTaskRecords ?? [],
    dailyStudySummaries: parsed.dailyStudySummaries ?? [],
    customBadgeGifts: parsed.customBadgeGifts ?? [],
    agentUiState: {
      agent: agentUiState.agent ?? "english",
      chatDate: agentUiState.chatDate || localDate(),
      activeConversationId: agentUiState.activeConversationId ?? "",
      questionDraft: agentUiState.questionDraft ?? "",
      imageTextDraft: agentUiState.imageTextDraft ?? "",
      imagePreview: agentUiState.imagePreview
    },
    syncState: {
      enabled: parsed.syncState?.enabled ?? false,
      configured: parsed.syncState?.configured ?? false,
      status: parsed.syncState?.status ?? "signed-out",
      role: "member",
      currentUser: parsed.syncState?.currentUser,
      spaceId: parsed.syncState?.spaceId,
      inviteCode: parsed.syncState?.inviteCode,
      schemaVersion: 3,
      lastPulledAtByClass: parsed.syncState?.lastPulledAtByClass ?? {},
      lastSyncedAt: parsed.syncState?.lastSyncedAt,
      lastPulledAt: parsed.syncState?.lastPulledAt,
      lastError: parsed.syncState?.lastError,
      pendingJobs: parsed.syncState?.pendingJobs ?? 0
    },
    settings: {
      ...initialData.settings,
      ...(parsed.settings ?? {})
    }
  };
}

function compactData(data: AppData): AppData {
  return {
    ...data,
    knowledgeFiles: data.knowledgeFiles.map((file) => ({
      ...file,
      chunks: file.chunks.map((chunk) => ({ id: chunk.id, text: chunk.text }))
    }))
  };
}

function readLocalStorageData(): AppData | undefined {
  if (!canUseLocalStorage()) return undefined;
  for (const key of [DATA_KEY_V2, DATA_KEY_V1]) {
    const stored = localStorage.getItem(key);
    if (!stored) continue;
    try {
      return normalizeAppData(JSON.parse(stored));
    } catch {
      // Try the next compatibility key.
    }
  }
  return undefined;
}

function saveLocalStorageFallback(data: AppData): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(DATA_KEY_V2, JSON.stringify(data));
  } catch {
    try {
      localStorage.setItem(DATA_KEY_V2, JSON.stringify(compactData(data)));
    } catch {
      // Keep the app usable when localStorage quota is exhausted.
    }
  }
}

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
      if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedDbData(): Promise<AppData | undefined> {
  if (!canUseIndexedDb()) return undefined;
  const db = await openLocalDb();
  const result = await new Promise<unknown>((resolve, reject) => {
    const request = db.transaction(DATA_STORE).objectStore(DATA_STORE).get(DATA_ID);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result ? normalizeAppData(result) : undefined;
}

async function writeIndexedDbData(data: AppData): Promise<void> {
  if (!canUseIndexedDb()) return;
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, "readwrite");
    tx.objectStore(DATA_STORE).put(data, DATA_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadData(): Promise<AppData> {
  try {
    const indexed = await Promise.race([
      readIndexedDbData(),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1500))
    ]);
    if (indexed) return indexed;
    const legacy = readLocalStorageData();
    const data = legacy ?? structuredClone(initialData);
    await saveData(data);
    return data;
  } catch {
    return readLocalStorageData() ?? structuredClone(initialData);
  }
}

export async function saveData(data: AppData): Promise<void> {
  const normalized = normalizeAppData(data);
  try {
    await writeIndexedDbData(normalized);
  } catch {
    // IndexedDB may be unavailable in tests or private modes; localStorage remains a fallback.
  }
  saveLocalStorageFallback(normalized);
}

export async function removeStoredData(): Promise<void> {
  if (canUseLocalStorage()) {
    localStorage.removeItem(DATA_KEY_V1);
    localStorage.removeItem(DATA_KEY_V2);
  }
  if (!canUseIndexedDb()) return;
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, "readwrite");
    tx.objectStore(DATA_STORE).delete(DATA_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function savePhoto(id: string, dataUrl: string): Promise<void> {
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(dataUrl, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  void uploadPhotoToCloud(id, dataUrl);
}

export async function getPhoto(id?: string): Promise<string | undefined> {
  if (!id) return undefined;
  const db = await openLocalDb();
  const result = await new Promise<string | undefined>((resolve, reject) => {
    const request = db.transaction(PHOTO_STORE).objectStore(PHOTO_STORE).get(id);
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result ?? await getCloudPhotoUrl(id);
}

export async function deletePhoto(id?: string): Promise<void> {
  if (!id) return;
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearPhotos(): Promise<void> {
  const db = await openLocalDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function allPhotos(): Promise<Record<string, string>> {
  const db = await openLocalDb();
  const result = await new Promise<Record<string, string>>((resolve, reject) => {
    const store = db.transaction(PHOTO_STORE).objectStore(PHOTO_STORE);
    const keysRequest = store.getAllKeys();
    const valuesRequest = store.getAll();
    const finish = () => {
      if (keysRequest.readyState === "done" && valuesRequest.readyState === "done") {
        resolve(Object.fromEntries(keysRequest.result.map((key, index) => [String(key), valuesRequest.result[index] as string])));
      }
    };
    keysRequest.onsuccess = finish;
    valuesRequest.onsuccess = finish;
    keysRequest.onerror = () => reject(keysRequest.error);
    valuesRequest.onerror = () => reject(valuesRequest.error);
  });
  db.close();
  return result;
}

export async function createBackup(data: AppData): Promise<BackupData> {
  const normalized = normalizeAppData(data);
  return {
    ...normalized,
    settings: {
      ...normalized.settings,
      deepSeekApiKey: "",
      qwenApiKey: "",
      serperApiKey: ""
    },
    exportedAt: new Date().toISOString(),
    photos: await allPhotos()
  };
}

export async function restoreBackup(backup: BackupData): Promise<AppData> {
  if (![1, 2, 3].includes(Number(backup.version)) || !Array.isArray(backup.habits) || !Array.isArray(backup.checkIns) || !Array.isArray(backup.reports)) {
    throw new Error("这不是有效的成长日记备份");
  }
  await clearPhotos();
  await Promise.all(Object.entries(backup.photos ?? {}).map(([id, value]) => savePhoto(id, value)));
  const data = normalizeAppData(backup);
  await saveData(data);
  return data;
}
