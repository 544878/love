package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

private const val MINUTE_SECONDS = 60L

fun elapsedTimerSeconds(timer: JSONObject?, now: Instant = Instant.now()): Long {
    if (timer == null) return 0
    val liveSeconds = if (timer.optBoolean("running")) {
        val started = Instant.parse(timer.getString("startedAt")).toEpochMilli()
        kotlin.math.max(0, (now.toEpochMilli() - started) / 1000)
    } else {
        0
    }
    return kotlin.math.max(0, timer.optLong("accumulatedSeconds") + liveSeconds)
}

fun formatDuration(seconds: Long): String {
    val safe = kotlin.math.max(0, seconds)
    val hours = safe / 3600
    val minutes = (safe % 3600) / 60
    val rest = (safe % 60).toString().padStart(2, '0')
    return if (hours > 0) "$hours:${minutes.toString().padStart(2, '0')}:$rest" else "$minutes:$rest"
}

fun startStudyTimer(title: String, note: String = "", now: Instant = Instant.now(), owner: String = "ru"): JSONObject {
    val at = iso(now)
    return JSONObject()
        .put("id", "study-timer-${now.toEpochMilli()}")
        .put("title", title.trim().ifEmpty { "学习" })
        .put("note", note.trim())
        .put("startedAt", at)
        .put("accumulatedSeconds", 0)
        .put("running", true)
        .put("updatedAt", at)
        .put("owner", owner)
}

fun pauseStudyTimer(timer: JSONObject, now: Instant = Instant.now()): JSONObject {
    val at = iso(now)
    return JSONObject(timer.toString())
        .put("accumulatedSeconds", elapsedTimerSeconds(timer, now))
        .put("running", false)
        .put("startedAt", at)
        .put("updatedAt", at)
}

fun resumeStudyTimer(timer: JSONObject, now: Instant = Instant.now()): JSONObject {
    val at = iso(now)
    return JSONObject(timer.toString())
        .put("startedAt", at)
        .put("running", true)
        .put("updatedAt", at)
}

fun finishStudyTimer(timer: JSONObject, now: Instant = Instant.now()): JSONObject {
    val endedAt = iso(now)
    val id = timer.optString("id")
    val startedAt = if (id.startsWith("study-timer-")) {
        iso(Instant.ofEpochMilli(id.removePrefix("study-timer-").toLong()))
    } else {
        timer.optString("startedAt")
    }
    return JSONObject()
        .put("id", "study-session-${now.toEpochMilli()}")
        .put("date", localDate(now.atZone(java.time.ZoneId.systemDefault()).toLocalDate()))
        .put("title", timer.optString("title").trim().ifEmpty { "学习" })
        .put("note", timer.optString("note").trim())
        .put("startedAt", startedAt)
        .put("endedAt", endedAt)
        .put("durationSeconds", elapsedTimerSeconds(timer, now))
        .put("source", "timer")
        .put("syncStatus", "local")
        .put("owner", timer.optString("owner").ifEmpty { "ru" })
}

private fun isMinuteHabit(habit: JSONObject?): Boolean {
    if (habit == null) return false
    val unit = habit.optString("unit")
    return habit.optString("id") == "study" || unit.contains("分") || unit == "鍒嗛挓"
}

fun legacyStudySeconds(data: JSONObject): Long {
    val habits = data.optJSONArray("habits") ?: JSONArray()
    val habitById = buildMap {
        for (index in 0 until habits.length()) {
            val habit = habits.getJSONObject(index)
            put(habit.optString("id"), habit)
        }
    }
    val checkIns = data.optJSONArray("checkIns") ?: JSONArray()
    var checkInMinutes = 0.0
    for (index in 0 until checkIns.length()) {
        val item = checkIns.getJSONObject(index)
        val habit = habitById[item.optString("habitId")]
        if (item.optBoolean("completed") && isMinuteHabit(habit)) checkInMinutes += item.optDouble("value", 0.0)
    }
    val reports = data.optJSONArray("reports") ?: JSONArray()
    var reportMinutes = 0.0
    for (index in 0 until reports.length()) {
        reportMinutes += kotlin.math.max(0.0, reports.getJSONObject(index).optDouble("studyMinutes", 0.0))
    }
    return (kotlin.math.max(checkInMinutes, reportMinutes) * MINUTE_SECONDS).toLong()
}

fun totalStudySeconds(data: JSONObject, now: Instant = Instant.now()): Long {
    val sessions = data.optJSONArray("studySessions") ?: JSONArray()
    var sessionSeconds = 0L
    for (index in 0 until sessions.length()) {
        sessionSeconds += kotlin.math.max(0, sessions.getJSONObject(index).optLong("durationSeconds"))
    }
    val timer = if (data.has("activeStudyTimer") && !data.isNull("activeStudyTimer")) data.optJSONObject("activeStudyTimer") else null
    return kotlin.math.max(sessionSeconds, legacyStudySeconds(data)) + elapsedTimerSeconds(timer, now)
}

fun todayStudySeconds(data: JSONObject, date: String = localDate(), now: Instant = Instant.now()): Long {
    val sessions = data.optJSONArray("studySessions") ?: JSONArray()
    var sessionSeconds = 0L
    for (index in 0 until sessions.length()) {
        val item = sessions.getJSONObject(index)
        if (item.optString("date") == date) sessionSeconds += kotlin.math.max(0, item.optLong("durationSeconds"))
    }
    val timer = if (data.has("activeStudyTimer") && !data.isNull("activeStudyTimer")) data.optJSONObject("activeStudyTimer") else null
    val activeSeconds = if (timer != null && localDate(Instant.parse(timer.getString("startedAt")).atZone(java.time.ZoneId.systemDefault()).toLocalDate()) == date) {
        elapsedTimerSeconds(timer, now)
    } else {
        0
    }
    if (sessionSeconds != 0L || activeSeconds != 0L) return sessionSeconds + activeSeconds
    val reports = data.optJSONArray("reports") ?: JSONArray()
    var reportMinutes = 0.0
    for (index in 0 until reports.length()) {
        val report = reports.getJSONObject(index)
        if (report.optString("date") == date) reportMinutes = report.optDouble("studyMinutes", 0.0)
    }
    val habits = data.optJSONArray("habits") ?: JSONArray()
    val habitById = buildMap {
        for (index in 0 until habits.length()) {
            val habit = habits.getJSONObject(index)
            put(habit.optString("id"), habit)
        }
    }
    val checkIns = data.optJSONArray("checkIns") ?: JSONArray()
    var checkInMinutes = 0.0
    for (index in 0 until checkIns.length()) {
        val item = checkIns.getJSONObject(index)
        val habit = habitById[item.optString("habitId")]
        if (item.optString("date") == date && item.optBoolean("completed") && isMinuteHabit(habit)) {
            checkInMinutes += item.optDouble("value", 0.0)
        }
    }
    return (kotlin.math.max(reportMinutes, checkInMinutes) * MINUTE_SECONDS).toLong()
}

fun studyMinutesLabel(seconds: Long): String = "${kotlin.math.max(0, seconds) / MINUTE_SECONDS} 分钟"
