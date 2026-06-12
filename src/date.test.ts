import { describe, expect, it } from "vitest";
import { calculateStreak, completedDates, monthCells, shiftDate, weekRange } from "./date";
import type { CheckIn, DailyReport } from "./types";

const check = (date: string): CheckIn => ({
  id: date,
  habitId: "study",
  date,
  value: 30,
  note: "",
  completed: true,
  updatedAt: `${date}T12:00:00.000Z`
});

const report = (date: string): DailyReport => ({
  id: date,
  date,
  mood: "平静柔软",
  studyMinutes: 30,
  lifeNote: "",
  message: "",
  submittedAt: `${date}T12:00:00.000Z`
});

describe("growth date calculations", () => {
  it("counts only dates containing both a check-in and a report", () => {
    expect([...completedDates([check("2026-06-01"), check("2026-06-02")], [report("2026-06-02"), report("2026-06-03")])]).toEqual(["2026-06-02"]);
  });

  it("calculates a streak ending today", () => {
    const dates = ["2026-06-05", "2026-06-06", "2026-06-07"];
    expect(calculateStreak(dates.map(check), dates.map(report), "2026-06-07")).toBe(3);
  });

  it("keeps yesterday's streak before today's report is complete", () => {
    const dates = ["2026-06-05", "2026-06-06"];
    expect(calculateStreak(dates.map(check), dates.map(report), "2026-06-07")).toBe(2);
  });

  it("handles month and week boundaries using local dates", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekRange("2026-06-07")).toEqual(["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", "2026-06-07"]);
    expect(monthCells(2026, 5)[0]).toBe("2026-06-01");
    expect(monthCells(2026, 7).slice(0, 5)).toEqual([null, null, null, null, null]);
  });
});
