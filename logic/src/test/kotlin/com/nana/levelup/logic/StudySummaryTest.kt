package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StudySummaryTest {
    @Test
    fun includesOnlySameDayTimersAndExercises() {
        val data = initialData()
        data.put("studySessions", JSONArray()
            .put(session("today-session", "2026-06-13", "阅读"))
            .put(session("old-session", "2026-06-12", "旧记录")))
        data.put("studyMetrics", JSONArray()
            .put(JSONObject()
                .put("id", "exercise")
                .put("date", "2026-06-13")
                .put("kind", "exercise")
                .put("title", "阅读题")
                .put("count", 20)
                .put("durationMinutes", 35)
                .put("createdAt", "2026-06-13T02:00:00.000Z"))
            .put(JSONObject()
                .put("id", "words")
                .put("date", "2026-06-13")
                .put("kind", "words")
                .put("title", "单词")
                .put("count", 100)
                .put("durationMinutes", 20)
                .put("createdAt", "2026-06-13T03:00:00.000Z")))
        data.put("wordLearningRecords", JSONArray().put(JSONObject()
            .put("id", "words-today")
            .put("date", "2026-06-13")
            .put("newWords", 24)
            .put("reviewedWords", 60)
            .put("note", "")
            .put("owner", "ru")
            .put("createdAt", "2026-06-13T03:30:00.000Z")))
        data.put("dailyTaskRecords", JSONArray().put(JSONObject()
            .put("id", "study-task")
            .put("owner", "ru")
            .put("date", "2026-06-13")
            .put("title", "精读课文")
            .put("group", "英语")
            .put("unit", "次")
            .put("target", 1)
            .put("value", 1)
            .put("completed", true)
            .put("note", "")
            .put("createdAt", "2026-06-13T04:00:00.000Z")
            .put("updatedAt", "2026-06-13T04:20:00.000Z")))
        data.put("todos", JSONArray().put(JSONObject()
            .put("id", "todo")
            .put("title", "不应进入总结")
            .put("kind", "short")
            .put("startDate", "2026-06-13")
            .put("completedDates", JSONArray().put("2026-06-13"))
            .put("createdAt", "2026-06-13T00:00:00.000Z")
            .put("updatedAt", "2026-06-13T00:00:00.000Z")))

        assertEquals(
            listOf("阅读 30 分钟", "阅读题 20 道，用时 35 分钟", "新学 24 个单词，复习 60 个", "完成学习任务「精读课文」"),
            buildTodayStudySummary(data, "2026-06-13")
        )
        assertEquals(listOf("旧记录 30 分钟"), buildTodayStudySummary(data, "2026-06-12"))
        assertFalse(studySummarySourceHash(data, "2026-06-13").contains("不应进入总结"))
        assertTrue(localStudySummaryText(listOf("阅读 30 分钟")).contains("阅读 30 分钟"))
    }

    @Test
    fun storesOnlyOneSummaryPerOwnerAndDate() {
        val first = JSONObject()
            .put("id", "summary-1")
            .put("owner", "ru")
            .put("date", "2026-06-13")
            .put("text", "旧总结")
            .put("source", "local")
            .put("sourceHash", "old")
            .put("generatedAt", "2026-06-13T10:00:00.000Z")
        val next = JSONObject(first.toString()).put("id", "summary-2").put("text", "新总结").put("sourceHash", "new")
        val stored = upsertDailyStudySummary(JSONArray().put(first), next)
        assertEquals(1, stored.length())
        assertEquals("summary-2", stored.getJSONObject(0).getString("id"))
        assertEquals("新总结", stored.getJSONObject(0).getString("text"))
    }

    private fun session(id: String, date: String, title: String) = JSONObject()
        .put("id", id)
        .put("date", date)
        .put("title", title)
        .put("note", "")
        .put("startedAt", "${date}T01:00:00.000Z")
        .put("endedAt", "${date}T01:30:00.000Z")
        .put("durationSeconds", 1800)
        .put("source", "timer")
}
