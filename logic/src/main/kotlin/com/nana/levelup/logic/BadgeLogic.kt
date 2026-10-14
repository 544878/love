package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

fun buildBadges(data: JSONObject, now: Instant = Instant.now()): JSONArray {
    val checkIns = data.optJSONArray("checkIns") ?: JSONArray()
    val reports = data.optJSONArray("reports") ?: JSONArray()
    val streak = calculateStreak(checkIns, reports)
    val totalMinutes = totalStudySeconds(data, now) / 60
    val activeDays = completedDates(checkIns, reports).size
    val reportCount = reports.length()
    val conversations = data.optJSONArray("agentConversations") ?: JSONArray()
    var chatTurns = 0
    var plannerChats = 0
    for (index in 0 until conversations.length()) {
        val item = conversations.getJSONObject(index)
        val messages = item.optJSONArray("messages") ?: JSONArray()
        if (item.optString("agent") == "planner" && messages.length() > 0) plannerChats += 1
        for (messageIndex in 0 until messages.length()) {
            if (messages.getJSONObject(messageIndex).optString("role") == "user") chatTurns += 1
        }
    }
    val knowledgeFiles = data.optJSONArray("knowledgeFiles")?.length() ?: 0
    var foodReports = 0
    for (index in 0 until reports.length()) {
        val report = reports.getJSONObject(index)
        if (report.optString("breakfast").isNotEmpty() || report.optString("lunch").isNotEmpty() || report.optString("dinner").isNotEmpty()) {
            foodReports += 1
        }
    }
    val values = listOf(
        listOf("first", "洳的第一天", "完成第一份今日记录", "flower", reportCount, 1),
        listOf("streak-3", "小猫爪坚持", "连续打卡 3 天", "sparkle", streak, 3),
        listOf("streak-7", "一周亮晶晶", "连续认真 7 天", "star", streak, 7),
        listOf("minutes-300", "学习能量豆", "累计学习/训练 300 分钟", "seed", totalMinutes, 300),
        listOf("days-30", "南师小花园", "留下 30 个完整成长日", "bloom", activeDays, 30),
        listOf("chat-10", "AI 伙伴熟悉啦", "和智能体完成 10 轮有效对话", "chat", chatTurns, 10),
        listOf("library-3", "知识库小书架", "上传 3 份本地学习材料", "book", knowledgeFiles, 3),
        listOf("food-7", "好好吃饭星", "记录 7 天饮食线索", "meal", foodReports, 7),
        listOf("planner-5", "番茄钟指挥官", "开启 5 个计划助手会话", "timer", plannerChats, 5)
    )
    val badges = JSONArray()
    for (row in values) {
        val progress = (row[4] as Number).toLong()
        val target = (row[5] as Number).toLong()
        val capped = kotlin.math.min(progress, target)
        badges.put(
            JSONObject()
                .put("id", row[0])
                .put("name", row[1])
                .put("description", row[2])
                .put("icon", row[3])
                .put("progress", capped)
                .put("target", target)
                .put("unlocked", progress >= target)
        )
    }
    return badges
}

fun weeklyCompletion(data: JSONObject, today: String): Int {
    val week = weekRange(today)
    val scheduled = mutableListOf<String>()
    val habits = data.optJSONArray("habits") ?: JSONArray()
    for (index in 0 until habits.length()) {
        val habit = habits.getJSONObject(index)
        val days = habit.optJSONArray("days") ?: JSONArray()
        val daySet = buildSet {
            for (dayIndex in 0 until days.length()) add(days.optInt(dayIndex))
        }
        for (date in week) {
            if (jsDay(parseLocalDate(date)) in daySet) scheduled += "$date:${habit.optString("id")}"
        }
    }
    if (scheduled.isEmpty()) return 0
    val done = buildSet {
        val checkIns = data.optJSONArray("checkIns") ?: JSONArray()
        for (index in 0 until checkIns.length()) {
            val item = checkIns.getJSONObject(index)
            if (item.optBoolean("completed")) add("${item.optString("date")}:${item.optString("habitId")}")
        }
    }
    return kotlin.math.round(scheduled.count { it in done } * 100.0 / scheduled.size).toInt()
}
