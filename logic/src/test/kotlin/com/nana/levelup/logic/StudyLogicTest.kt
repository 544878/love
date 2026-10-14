package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class StudyLogicTest {
    private fun at(iso: String) = Instant.parse(iso)

    @Test
    fun startsPausesResumesAndFinishes() {
        val started = startStudyTimer("阅读", "chapter 1", at("2026-06-08T10:00:00.000Z"))
        assertEquals(90, elapsedTimerSeconds(started, at("2026-06-08T10:01:30.000Z")))
        val paused = pauseStudyTimer(started, at("2026-06-08T10:02:00.000Z"))
        assertEquals(false, paused.getBoolean("running"))
        assertEquals(120, paused.getLong("accumulatedSeconds"))
        val resumed = resumeStudyTimer(paused, at("2026-06-08T10:05:00.000Z"))
        val session = finishStudyTimer(resumed, at("2026-06-08T10:06:15.000Z"))
        assertEquals(195, session.getLong("durationSeconds"))
        assertEquals("阅读", session.getString("title"))
        assertEquals("timer", session.getString("source"))
    }

    @Test
    fun prefersStudySessionsWhileKeepingLegacyMinutes() {
        val data = initialData()
        data.put("checkIns", JSONArray().put(JSONObject()
            .put("id", "legacy-check")
            .put("habitId", "study")
            .put("date", "2026-06-08")
            .put("value", 30)
            .put("note", "")
            .put("completed", true)
            .put("updatedAt", "2026-06-08T10:00:00.000Z")))
        data.put("reports", JSONArray().put(JSONObject()
            .put("id", "legacy-report")
            .put("date", "2026-06-08")
            .put("mood", "元气满满")
            .put("studyMinutes", 45)
            .put("lifeNote", "")
            .put("message", "")
            .put("submittedAt", "2026-06-08T20:00:00.000Z")))
        data.put("studySessions", JSONArray())
        assertEquals(45 * 60, totalStudySeconds(data))

        val withSessions = JSONObject(data.toString())
        withSessions.put("studySessions", JSONArray().put(JSONObject()
            .put("id", "session-1")
            .put("date", "2026-06-08")
            .put("title", "阅读")
            .put("note", "")
            .put("startedAt", "2026-06-08T10:00:00.000Z")
            .put("endedAt", "2026-06-08T11:20:00.000Z")
            .put("durationSeconds", 80 * 60)
            .put("source", "timer")))
        assertEquals(80 * 60, totalStudySeconds(withSessions))
        assertEquals(80 * 60, todayStudySeconds(withSessions, "2026-06-08"))
    }
}
