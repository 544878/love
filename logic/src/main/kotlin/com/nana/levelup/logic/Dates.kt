package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.util.Calendar

fun localDate(date: LocalDate = LocalDate.now()): String = date.toString()

fun parseLocalDate(value: String): LocalDate = LocalDate.parse(value)

fun jsDay(date: LocalDate): Int = date.dayOfWeek.value % 7

fun shiftDate(value: String, days: Int): String = parseLocalDate(value).plusDays(days.toLong()).toString()

fun friendlyDate(value: String): String {
    val date = parseLocalDate(value)
    return "${date.monthValue}月${date.dayOfMonth}日 星期${"日一二三四五六"[jsDay(date)]}"
}

fun completedDates(checkIns: JSONArray, reports: JSONArray): Set<String> {
    val reportDates = buildSet {
        for (index in 0 until reports.length()) add(reports.getJSONObject(index).optString("date"))
    }
    val activeDates = buildSet {
        for (index in 0 until checkIns.length()) {
            val item = checkIns.getJSONObject(index)
            if (item.optBoolean("completed")) add(item.optString("date"))
        }
    }
    return reportDates.filterTo(linkedSetOf()) { it in activeDates }
}

fun calculateStreak(checkIns: JSONArray, reports: JSONArray, today: String = localDate()): Int {
    val dates = completedDates(checkIns, reports)
    var cursor = if (today in dates) today else shiftDate(today, -1)
    var streak = 0
    while (cursor in dates) {
        streak += 1
        cursor = shiftDate(cursor, -1)
    }
    return streak
}

fun weekRange(today: String = localDate()): List<String> {
    val current = parseLocalDate(today)
    val mondayOffset = (jsDay(current) + 6) % 7
    return List(7) { index -> shiftDate(today, index - mondayOffset) }
}

fun monthCells(year: Int, month: Int): List<String?> {
    val first = LocalDate.of(year, month + 1, 1)
    val offset = (jsDay(first) + 6) % 7
    val days = first.lengthOfMonth()
    return List(offset) { null } + List(days) { index -> localDate(first.plusDays(index.toLong())) }
}

fun notificationDate(date: String, time: String): Calendar {
    val local = parseLocalDate(date)
    val parts = time.split(":")
    val hours = parts.getOrNull(0)?.toIntOrNull() ?: 0
    val minutes = parts.getOrNull(1)?.toIntOrNull() ?: 0
    return Calendar.getInstance().apply {
        set(Calendar.YEAR, local.year)
        set(Calendar.MONTH, local.monthValue - 1)
        set(Calendar.DAY_OF_MONTH, local.dayOfMonth)
        set(Calendar.HOUR_OF_DAY, hours)
        set(Calendar.MINUTE, minutes)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
}
