package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AutomationLogicTest {
    @Test
    fun createsSevenDayRangeAcrossMonthBoundary() {
        assertEquals(
            listOf("2026-06-28", "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"),
            nextAutomationDates("2026-06-28")
        )
    }

    @Test
    fun convertsMarkdownIntoNotificationText() {
        assertEquals("今日\n· 带伞\n天气", stripMarkdown("## 今日\n- **带伞**\n[天气](https://example.com)"))
        assertEquals("12345…", truncateText("**1234567890**", 6))
    }

    @Test
    fun buildsLocalNotificationTime() {
        val date = notificationDate("2026-06-08", "07:30")
        assertEquals(2026, date.get(java.util.Calendar.YEAR))
        assertEquals(5, date.get(java.util.Calendar.MONTH))
        assertEquals(8, date.get(java.util.Calendar.DAY_OF_MONTH))
        assertEquals(7, date.get(java.util.Calendar.HOUR_OF_DAY))
        assertEquals(30, date.get(java.util.Calendar.MINUTE))
    }

    @Test
    fun mapsWeatherAndCompanionFallback() {
        assertEquals("晴朗", weatherSummary(0))
        assertEquals("有雨", weatherSummary(63))
        assertTrue(fallbackCompanionMessage("2026-06-08", "温柔", "陶陶").contains("陶陶"))
    }

    @Test
    fun keepsNewlyCreatedRemindersWhenRefreshFinishes() {
        val base = initialData()
        val custom = JSONObject(base.getJSONArray("automations").getJSONObject(0).toString())
            .put("id", "custom-reminder")
            .put("title", "我的提醒")
        val automations = JSONArray(base.getJSONArray("automations").toString()).put(custom)
        val current = JSONObject(base.toString()).put("automations", automations)
        val stale = JSONObject(base.toString()).put("automationRuns", JSONArray().put(JSONObject()
            .put("id", "run")
            .put("ruleId", custom.getString("id"))
            .put("date", "2026-06-12")
            .put("title", custom.getString("title"))
            .put("body", "ok")
            .put("status", "generated")
            .put("generatedAt", "2026-06-12T00:00:00.000Z")))
        val merged = mergeAutomationRefresh(current, stale)
        var found = false
        val mergedAutomations = merged.getJSONArray("automations")
        for (index in 0 until mergedAutomations.length()) {
            if (mergedAutomations.getJSONObject(index).optString("id") == "custom-reminder") found = true
        }
        assertTrue(found)
        assertEquals(1, merged.getJSONArray("automationRuns").length())
    }
}
