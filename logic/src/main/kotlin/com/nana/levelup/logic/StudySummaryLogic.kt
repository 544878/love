package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject

private fun sameOwner(item: JSONObject, owner: String, defaultOwner: String?): Boolean {
    val value = if (item.has("owner") && !item.isNull("owner")) item.optString("owner") else defaultOwner
    return value == owner
}

fun buildTodayStudySummary(data: JSONObject, date: String, owner: String = "ru"): List<String> {
    val lines = mutableListOf<String>()
    val sessions = data.optJSONArray("studySessions") ?: JSONArray()
    for (index in 0 until sessions.length()) {
        val item = sessions.getJSONObject(index)
        if (item.optString("date") != date || !sameOwner(item, owner, "ru")) continue
        val minutes = kotlin.math.max(1, kotlin.math.round(item.optLong("durationSeconds") / 60.0).toInt())
        lines += "${item.optString("title")} $minutes 分钟"
    }
    val metrics = data.optJSONArray("studyMetrics") ?: JSONArray()
    for (index in 0 until metrics.length()) {
        val item = metrics.getJSONObject(index)
        if (item.optString("date") != date || item.optString("kind") != "exercise" || !sameOwner(item, owner, "ru")) continue
        val duration = item.optInt("durationMinutes", 0)
        val suffix = if (duration != 0) "，用时 $duration 分钟" else ""
        lines += "${item.optString("title")} ${item.optInt("count")} 道$suffix"
    }
    val words = data.optJSONArray("wordLearningRecords") ?: JSONArray()
    for (index in 0 until words.length()) {
        val item = words.getJSONObject(index)
        if (item.optString("date") != date || !sameOwner(item, owner, null)) continue
        lines += "新学 ${item.optInt("newWords")} 个单词，复习 ${item.optInt("reviewedWords")} 个"
    }
    val tasks = data.optJSONArray("dailyTaskRecords") ?: JSONArray()
    for (index in 0 until tasks.length()) {
        val item = tasks.getJSONObject(index)
        if (item.optString("date") != date || !sameOwner(item, owner, null) || !item.optBoolean("completed")) continue
        lines += "完成学习任务「${item.optString("title")}」"
    }
    return lines
}

fun studySummarySourceHash(data: JSONObject, date: String, owner: String = "ru"): String {
    val sessions = JSONArray()
    val sourceSessions = data.optJSONArray("studySessions") ?: JSONArray()
    for (index in 0 until sourceSessions.length()) {
        val item = sourceSessions.getJSONObject(index)
        if (item.optString("date") != date || !sameOwner(item, owner, "ru")) continue
        sessions.put(
            JSONObject()
                .put("id", item.optString("id"))
                .put("title", item.optString("title"))
                .put("note", item.optString("note"))
                .put("durationSeconds", item.optLong("durationSeconds"))
                .put("endedAt", item.optString("endedAt"))
        )
    }
    val metrics = JSONArray()
    val sourceMetrics = data.optJSONArray("studyMetrics") ?: JSONArray()
    for (index in 0 until sourceMetrics.length()) {
        val item = sourceMetrics.getJSONObject(index)
        if (item.optString("date") != date || !sameOwner(item, owner, "ru")) continue
        metrics.put(
            JSONObject()
                .put("id", item.optString("id"))
                .put("kind", item.optString("kind"))
                .put("title", item.optString("title"))
                .put("count", item.optInt("count"))
                .put("durationMinutes", item.optInt("durationMinutes"))
        )
    }
    val words = JSONArray()
    val sourceWords = data.optJSONArray("wordLearningRecords") ?: JSONArray()
    for (index in 0 until sourceWords.length()) {
        val item = sourceWords.getJSONObject(index)
        if (item.optString("date") != date || !sameOwner(item, owner, null)) continue
        words.put(
            JSONObject()
                .put("id", item.optString("id"))
                .put("newWords", item.optInt("newWords"))
                .put("reviewedWords", item.optInt("reviewedWords"))
                .put("note", item.optString("note"))
        )
    }
    val tasks = JSONArray()
    val sourceTasks = data.optJSONArray("dailyTaskRecords") ?: JSONArray()
    for (index in 0 until sourceTasks.length()) {
        val item = sourceTasks.getJSONObject(index)
        if (item.optString("date") != date || !sameOwner(item, owner, null) || !item.optBoolean("completed")) continue
        tasks.put(
            JSONObject()
                .put("id", item.optString("id"))
                .put("title", item.optString("title"))
                .put("group", item.optString("group"))
                .put("value", item.opt("value"))
                .put("target", item.opt("target"))
                .put("unit", item.optString("unit"))
                .put("note", item.optString("note"))
        )
    }
    return JSONObject()
        .put("sessions", sessions)
        .put("metrics", metrics)
        .put("words", words)
        .put("tasks", tasks)
        .toString()
}

fun localStudySummaryText(lines: List<String>): String {
    return if (lines.isEmpty()) "" else "今天完成了${lines.joinToString("、")}。每一段专注都算数，照着自己的节奏继续就很好。"
}

fun upsertDailyStudySummary(summaries: JSONArray, summary: JSONObject): JSONArray {
    val next = JSONArray().put(summary)
    val date = summary.optString("date")
    val owner = summary.optString("owner")
    for (index in 0 until summaries.length()) {
        val item = summaries.getJSONObject(index)
        if (item.optString("date") == date && item.optString("owner") == owner) continue
        next.put(item)
    }
    return next
}
