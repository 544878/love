import type { CheckIn, DailyReport } from "./types";

export function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function shiftDate(value: string, days: number): string {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function friendlyDate(value: string): string {
  const date = parseLocalDate(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 星期${"日一二三四五六"[date.getDay()]}`;
}

export function completedDates(checkIns: CheckIn[], reports: DailyReport[]): Set<string> {
  const reportDates = new Set(reports.map((report) => report.date));
  const activeDates = new Set(checkIns.filter((item) => item.completed).map((item) => item.date));
  return new Set([...reportDates].filter((date) => activeDates.has(date)));
}

export function calculateStreak(checkIns: CheckIn[], reports: DailyReport[], today = localDate()): number {
  const dates = completedDates(checkIns, reports);
  let cursor = dates.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function weekRange(today = localDate()): string[] {
  const current = parseLocalDate(today);
  const mondayOffset = (current.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => shiftDate(today, index - mondayOffset));
}

export function monthCells(year: number, month: number): Array<string | null> {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, index) => localDate(new Date(year, month, index + 1)))
  ];
}
