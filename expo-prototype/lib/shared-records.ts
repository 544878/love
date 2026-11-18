import { z } from "zod";
import type { StoredBackup } from "./backup";
import { spaceIdSchema } from "./companion.ts";

export const wishSchema = z.looseObject({
  id: z.string(), author: z.string(), craving: z.string(), note: z.string().optional(),
  date: z.string(), fulfilled: z.boolean().optional(), status: z.enum(["requested", "accepted", "delivered"]).optional(),
  priority: z.enum(["normal", "want", "urgent"]).optional(), createdAt: z.string(), updatedAt: z.string().optional(),
  gardenSpaceId: spaceIdSchema.optional()
});
export const eventSchema = z.looseObject({
  id: z.string(), title: z.string(), date: z.string(),
  kind: z.enum(["game", "call", "meet", "anniversary", "date", "custom"]),
  note: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional(),
  createdAt: z.string(), updatedAt: z.string(), gardenSpaceId: spaceIdSchema.optional()
});
export const postSchema = z.looseObject({
  id: z.string(), author: z.string(), text: z.string(),
  date: z.string(), createdAt: z.string(), gardenSpaceId: spaceIdSchema.optional()
});

export const sharedClasses = {
  coupleMessages: "LoveChatMessage",
  feedWishes: "LoveFeedWish",
  coupleEvents: "LoveCoupleEvent",
  couplePosts: "LoveCouplePost"
} as const;

export type SharedKey = keyof typeof sharedClasses;
export type SharedRow = { id: string; gardenSpaceId?: string };
export type UserScope = { username: string; spaceId: string };
export const sharedJobSchema = z.object({
  id: z.string(), className: z.enum(["LoveChatMessage", "LoveFeedWish", "LoveCoupleEvent", "LoveCouplePost"]),
  recordId: z.string(), payload: z.looseObject({ id: z.string(), photoId: z.string().optional() }),
  queuedAt: z.string(), spaceId: spaceIdSchema, username: z.string()
});
export type SharedJob = z.infer<typeof sharedJobSchema>;

export function visibleShared<T extends SharedRow>(records: T[], scope?: UserScope | null): T[] {
  return records.filter((record) => !record.gardenSpaceId || record.gardenSpaceId === scope?.spaceId);
}

export function queueShared(
  data: StoredBackup, key: SharedKey, row: SharedRow, scope: UserScope | null, photos = data.photos
): StoredBackup {
  const record = { ...row, gardenSpaceId: scope?.spaceId };
  const next = {
    ...data, photos,
    [key]: [...data[key].filter((item) =>
      item.id !== row.id || (item.gardenSpaceId && item.gardenSpaceId !== scope?.spaceId)), record]
  };
  if (!scope) return next;
  const queuedAt = new Date().toISOString();
  const className = sharedClasses[key];
  return {
    ...next,
    cloudOutbox: [...data.cloudOutbox, {
      id: `${className}:${record.id}:${queuedAt}`, className, recordId: record.id,
      payload: record, queuedAt, ...scope
    } satisfies SharedJob]
  };
}

export function mergeShared<T extends SharedRow>(local: T[], remote: T[], scope: UserScope): T[] {
  const replaces = new Set(remote.map((row) => row.id));
  const untouched = local.filter((row) =>
    (row.gardenSpaceId && row.gardenSpaceId !== scope.spaceId) || !replaces.has(row.id));
  return [...untouched, ...remote.flatMap((row) =>
    "deletedAtIso" in row && row.deletedAtIso ? [] : [{ ...row, gardenSpaceId: scope.spaceId }])];
}
