import { describe, expect, it } from "vitest";
import {
  fallbackCompanionMessage,
  nextAutomationDates,
  notificationDate,
  stripMarkdown,
  truncateText,
  weatherSummary
} from "./automation";

describe("daily automation helpers", () => {
  it("creates a seven-day cache range across month boundaries", () => {
    expect(nextAutomationDates("2026-06-28")).toEqual([
      "2026-06-28",
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04"
    ]);
  });

  it("converts markdown into notification-safe plain text", () => {
    expect(stripMarkdown("## 今日\n- **带伞**\n[天气](https://example.com)")).toBe("今日\n· 带伞\n天气");
    expect(truncateText("**1234567890**", 6)).toBe("12345…");
  });

  it("builds local notification time without UTC shifting", () => {
    const date = notificationDate("2026-06-08", "07:30");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(8);
    expect(date.getHours()).toBe(7);
    expect(date.getMinutes()).toBe(30);
  });

  it("maps weather codes and always has an offline companion fallback", () => {
    expect(weatherSummary(0)).toBe("晴朗");
    expect(weatherSummary(63)).toBe("有雨");
    expect(fallbackCompanionMessage("2026-06-08", "温柔", "陶陶")).toContain("陶陶");
  });
});
