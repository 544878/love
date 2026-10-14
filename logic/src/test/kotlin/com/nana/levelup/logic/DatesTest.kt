package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class DatesTest {
    private fun check(date: String) = JSONObject()
        .put("id", date)
        .put("habitId", "study")
        .put("date", date)
        .put("value", 30)
        .put("note", "")
        .put("completed", true)
        .put("updatedAt", "${date}T12:00:00.000Z")

    private fun report(date: String) = JSONObject()
        .put("id", date)
        .put("date", date)
        .put("mood", "平静柔软")
        .put("studyMinutes", 30)
        .put("lifeNote", "")
        .put("message", "")
        .put("submittedAt", "${date}T12:00:00.000Z")

    private fun arrayOf(items: List<JSONObject>): JSONArray {
        val array = JSONArray()
        items.forEach { array.put(it) }
        return array
    }

    @Test
    fun countsOnlyDatesContainingBothCheckInAndReport() {
        val dates = completedDates(
            arrayOf(listOf(check("2026-06-01"), check("2026-06-02"))),
            arrayOf(listOf(report("2026-06-02"), report("2026-06-03")))
        )
        assertEquals(listOf("2026-06-02"), dates.toList())
    }

    @Test
    fun calculatesStreakEndingToday() {
        val dates = listOf("2026-06-05", "2026-06-06", "2026-06-07")
        assertEquals(3, calculateStreak(arrayOf(dates.map(::check)), arrayOf(dates.map(::report)), "2026-06-07"))
    }

    @Test
    fun keepsYesterdaysStreakBeforeTodaysReport() {
        val dates = listOf("2026-06-05", "2026-06-06")
        assertEquals(2, calculateStreak(arrayOf(dates.map(::check)), arrayOf(dates.map(::report)), "2026-06-07"))
    }

    @Test
    fun handlesMonthAndWeekBoundaries() {
        assertEquals("2026-02-28", shiftDate("2026-03-01", -1))
        assertEquals(
            listOf("2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", "2026-06-07"),
            weekRange("2026-06-07")
        )
        assertEquals("2026-06-01", monthCells(2026, 5)[0])
        assertEquals(listOf(null, null, null, null, null), monthCells(2026, 7).take(5))
    }
}
