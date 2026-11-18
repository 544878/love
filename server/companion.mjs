import { randomUUID } from "node:crypto";

const actions = new Set(["feed", "pet", "visit"]);
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const emptyRows = Object.freeze({});

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function dayInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function isDay(day) {
  if (typeof day !== "string" || !dayPattern.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

function adoption(space, members, timeZone, now) {
  if (typeof timeZone !== "string" || timeZone.length > 80 || !timeZone.trim()) {
    throw invalid("请选择有效的时区");
  }
  try {
    const zone = new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone;
    return {
      id: randomUUID(), spaceId: space.id, timeZone: zone,
      adoptedDay: dayInZone(now, zone), slots: { A: members[0], B: members[1] }
    };
  } catch {
    throw invalid("请选择有效的时区");
  }
}

function appendCare(rows, companion, slot, requests, now) {
  if (!Array.isArray(requests) || requests.length > 32) throw invalid("照顾记录无效");
  const today = dayInZone(now, companion.timeZone);
  const next = { ...rows };
  for (const record of requests) {
    const { day, action } = record || {};
    if (!isDay(day) || day < companion.adoptedDay || day > today || !actions.has(action)) {
      throw invalid("照顾日期或动作无效");
    }
    const key = `${day}/${slot}`;
    next[key] ??= { day, slot, action };
  }
  return next;
}

export function companionChange(space, userId, current, body, now = new Date()) {
  const members = Object.keys(space.members).sort();
  const existing = current.LoveCompanion?.current;
  if (members.length !== 2 || (existing && (
    existing.slots.A !== members[0] || existing.slots.B !== members[1]
  ))) {
    return { response: { status: "pair-required" } };
  }

  const operation = body.operation;
  if (!["state", "adopt", "care"].includes(operation)) throw invalid("伙伴请求无效");
  const companion = existing ?? (operation === "adopt" ? adoption(space, members, body.timeZone, now) : null);
  if (!companion) {
    if (operation === "care") throw invalid("请先领养伙伴");
    return { response: { status: "available" } };
  }

  const slot = companion.slots.A === userId ? "A" : "B";
  const rows = current.LoveCompanionCare ?? emptyRows;
  let next = rows;
  if (operation === "care") {
    if (body.companionId !== companion.id) throw invalid("伙伴与共享空间不匹配");
    next = appendCare(rows, companion, slot, body.records, now);
  }
  const { slots, ...publicCompanion } = companion;
  return {
    records: existing === companion && next === rows
      ? undefined
      : { LoveCompanion: { current: companion }, LoveCompanionCare: next },
    response: { status: "adopted", slot, companion: { ...publicCompanion, records: Object.values(next) } }
  };
}
