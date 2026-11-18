import Constants from "expo-constants";
import { z } from "zod";
import { chatSchema, type StoredBackup } from "./backup";
import { companionResponse, spaceIdSchema, type CareRecord } from "./companion";
import {
  eventSchema, mergeShared, postSchema, sharedClasses, sharedJobSchema, wishSchema, type SharedRow
} from "./shared-records";

function apiUrl(): string | null {
  const value: unknown = Constants.expoConfig?.extra?.cloudApiUrl;
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value.trim());
    const local = ["127.0.0.1", "localhost", "10.0.2.2"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    const path = url.href.replace(/\/+$/, "");
    return path.endsWith("/api") ? path : `${path}/api`;
  } catch {
    return null;
  }
}

export const cloudBase = apiUrl();
export class CloudFailure extends Error {
  constructor(readonly kind: "network" | "authentication" | "server") {
    super(kind);
  }
}

const spaceSchema = z.object({
  id: spaceIdSchema, inviteCode: z.string().optional(),
  capabilities: z.object({ companion: z.number().optional() }).optional()
});
export const sessionSchema = z.object({
  base: z.string(), token: z.string().min(1), username: z.string(),
  spaceId: spaceIdSchema, inviteCode: z.string().optional(),
  binding: z.object({ id: z.string().uuid(), slot: z.enum(["A", "B"]) }).optional()
});
export type Session = z.infer<typeof sessionSchema>;

async function request(path: string, body: object | undefined, token?: string): Promise<unknown> {
  if (!cloudBase) throw new CloudFailure("network");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 9_000);
  try {
    const response = await fetch(`${cloudBase}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      redirect: "error",
      signal: abort.signal
    });
    if (response.status === 401) throw new CloudFailure("authentication");
    if (!response.ok) throw new CloudFailure("server");
    return await response.json();
  } catch (error) {
    if (error instanceof CloudFailure) throw error;
    throw new CloudFailure("network");
  } finally {
    clearTimeout(timer);
  }
}

export async function signIn(username: string, password: string, spaceId: string, inviteCode: string): Promise<Session> {
  if (!cloudBase) throw new CloudFailure("network");
  const reply = z.object({
    token: z.string(), user: z.object({ username: z.string() }), space: spaceSchema
  }).parse(await request("/auth/login", { username, password, spaceId, inviteCode }));
  return { base: cloudBase, token: reply.token, username: reply.user.username, spaceId: reply.space.id, inviteCode: reply.space.inviteCode };
}

export async function canUseCompanion(session: Session): Promise<boolean> {
  const reply = z.object({ space: spaceSchema }).parse(
    await request("/spaces/ensure", { spaceId: session.spaceId }, session.token)
  );
  return reply.space.id === session.spaceId && reply.space.capabilities?.companion === 1;
}

type CompanionOperation =
  | { operation: "state" }
  | { operation: "adopt"; timeZone: string }
  | { operation: "care"; companionId: string; records: Array<Pick<CareRecord, "day" | "action">> };

export async function syncCompanion(session: Session, operation: CompanionOperation) {
  const reply = companionResponse.parse(await request(
    "/companion", { ...operation, spaceId: session.spaceId }, session.token
  ));
  if (reply.status === "adopted" && reply.companion.spaceId !== session.spaceId) throw new CloudFailure("server");
  return reply;
}

const pullSchema = z.object({
  collections: z.record(z.string(), z.object({ payloads: z.array(z.unknown()) }))
});

function validRows<T>(items: unknown[] | undefined, schema: z.ZodType<T>) {
  return (items ?? []).flatMap((value) => {
    const result = schema.safeParse(value);
    return result.success ? [result.data] : [];
  });
}

export async function syncShared(session: Session, snapshot: StoredBackup) {
  const jobs = validRows(snapshot.cloudOutbox, sharedJobSchema).filter((job) =>
    job.spaceId === session.spaceId && job.username === session.username);
  for (const job of jobs) {
    const id = job.payload.photoId;
    const dataUrl = id ? snapshot.photos[id] : undefined;
    if (id && dataUrl) await request("/photos", { id, dataUrl, spaceId: session.spaceId }, session.token);
  }
  if (jobs.length) {
    await request("/sync/push", {
      spaceId: session.spaceId,
      records: jobs.map(({ className, recordId, payload }) => ({ className, recordId, payload }))
    }, session.token);
  }

  const { collections } = pullSchema.parse(await request("/sync/pull", {
    spaceId: session.spaceId, classes: Object.values(sharedClasses)
  }, session.token));
  const messages = validRows(collections.LoveChatMessage?.payloads, chatSchema);
  const photos: Record<string, string> = {};
  for (const id of new Set(messages.flatMap((message) => message.photoId ?? []))) {
    if (Object.hasOwn(snapshot.photos, id) || !cloudBase) continue;
    try {
      const path = `/photos/${encodeURIComponent(id)}?spaceId=${encodeURIComponent(session.spaceId)}`;
      const { dataUrl } = z.object({ dataUrl: z.string().startsWith("data:image/") }).parse(
        await request(path, undefined, session.token)
      );
      photos[id] = dataUrl;
    } catch {
      // An unavailable photo can be fetched again on the next sync.
    }
  }

  const sentIds = new Set(jobs.map((job) => job.id));
  return (current: StoredBackup): StoredBackup => {
    const remainingJobs = current.cloudOutbox.filter((value) => {
      const job = sharedJobSchema.safeParse(value);
      return !job.success || !sentIds.has(job.data.id);
    });
    const pending = new Set(validRows(remainingJobs, sharedJobSchema).filter((job) =>
      job.spaceId === session.spaceId && job.username === session.username
    ).map((job) => `${job.className}:${job.recordId}`));
    function merge<T extends SharedRow>(className: string, local: T[], remote: T[]) {
      return mergeShared(local, remote.filter((row) => !pending.has(`${className}:${row.id}`)), session);
    }
    return {
      ...current,
      photos: { ...current.photos, ...photos },
      cloudOutbox: remainingJobs,
      coupleMessages: merge("LoveChatMessage", current.coupleMessages, messages),
      feedWishes: merge("LoveFeedWish", current.feedWishes, validRows(collections.LoveFeedWish?.payloads, wishSchema)),
      coupleEvents: merge("LoveCoupleEvent", current.coupleEvents, validRows(collections.LoveCoupleEvent?.payloads, eventSchema)),
      couplePosts: merge("LoveCouplePost", current.couplePosts, validRows(collections.LoveCouplePost?.payloads, postSchema))
    };
  };
}
