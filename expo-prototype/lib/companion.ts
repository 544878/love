import { z } from "zod";

export const actions = ["feed", "pet", "visit"] as const;
export const actionSchema = z.enum(actions);
export type CareAction = z.infer<typeof actionSchema>;
export const actionLabels: Record<CareAction, string> = { feed: "喂一口", pet: "摸摸它", visit: "陪一会" };
export const slotSchema = z.enum(["A", "B"]);
export type MemberSlot = z.infer<typeof slotSchema>;

export const spaceIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{3,64}$/);
const daySchema = z.string().date();
const timeZoneSchema = z.string().min(1).max(80).refine((timeZone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
});
export const careSchema = z.object({ day: daySchema, slot: slotSchema, action: actionSchema });
export type CareRecord = z.infer<typeof careSchema>;

export const companionSchema = z.object({
  id: z.string().uuid(), spaceId: spaceIdSchema, timeZone: timeZoneSchema,
  adoptedDay: daySchema, records: z.array(careSchema)
});
export type Companion = z.infer<typeof companionSchema>;
export const progressSchema = companionSchema.extend({ pending: z.array(careSchema) });
export type Progress = z.infer<typeof progressSchema>;

export const companionResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pair-required") }),
  z.object({ status: z.literal("available") }),
  z.object({ status: z.literal("adopted"), slot: slotSchema, companion: companionSchema })
]);
export type CompanionResponse = z.infer<typeof companionResponse>;

export function dayInZone(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function careKey(record: Pick<CareRecord, "day" | "slot">): string {
  return `${record.day}/${record.slot}`;
}

export function allCare(progress: Progress): CareRecord[] {
  const unique = new Map<string, CareRecord>();
  for (const record of [...progress.records, ...progress.pending]) {
    if (!unique.has(careKey(record))) unique.set(careKey(record), record);
  }
  return [...unique.values()];
}

export function careScore(progress: Progress): number {
  const entries = allCare(progress);
  const days = new Set(entries.map(({ day }) => day));
  return entries.length + entries.length - days.size;
}

export type Stage = "初来" | "亲近" | "长大";
export function growthStage(points: number): Stage {
  return points >= 10 ? "长大" : points >= 4 ? "亲近" : "初来";
}

export function mergeCompanion(remote: Companion, local?: Progress): Progress {
  const saved = new Set(remote.records.map(careKey));
  const pending = local?.id === remote.id ? local.pending.filter((record) =>
    record.day >= remote.adoptedDay && !saved.has(careKey(record))) : [];
  return { ...remote, pending };
}
