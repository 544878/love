package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

val cloudClasses = listOf(
    "habits" to "LoveHabit",
    "checkIns" to "LoveCheckIn",
    "reports" to "LoveDailyReport",
    "studySessions" to "LoveStudySession",
    "dailyBriefs" to "LoveDailyBrief",
    "automations" to "LoveAutomationRule",
    "automationRuns" to "LoveAutomationRun",
    "knowledgeFiles" to "LoveKnowledgeFile",
    "agentConversations" to "LoveAgentConversation",
    "couplePosts" to "LoveCouplePost",
    "feedWishes" to "LoveFeedWish",
    "sharedCourses" to "LoveSharedCourse",
    "coupleEvents" to "LoveCoupleEvent",
    "todos" to "LoveTodo",
    "coupleMessages" to "LoveChatMessage",
    "studyMetrics" to "LoveStudyMetric",
    "wordLearningRecords" to "LoveWordLearningRecord",
    "taskTemplates" to "LoveTaskTemplate",
    "dailyTaskRecords" to "LoveDailyTaskRecord",
    "dailyStudySummaries" to "LoveDailyStudySummary",
    "customBadgeGifts" to "LoveBadgeGift"
)

fun cloudState(configured: Boolean, session: JSONObject?, tokenPresent: Boolean, patch: JSONObject? = null): JSONObject {
    val signedIn = session != null && tokenPresent
    val state = JSONObject()
        .put("enabled", signedIn)
        .put("configured", configured)
        .put("status", if (signedIn) "idle" else "signed-out")
        .put("role", "member")
        .put("schemaVersion", 3)
        .put("lastPulledAtByClass", JSONObject())
        .put("pendingJobs", 0)
    if (session != null) {
        if (session.has("currentUser") && !session.isNull("currentUser")) state.put("currentUser", session.get("currentUser"))
        if (session.has("spaceId") && !session.isNull("spaceId")) state.put("spaceId", session.get("spaceId"))
        if (session.has("inviteCode") && !session.isNull("inviteCode")) state.put("inviteCode", session.get("inviteCode"))
        if (session.has("role") && !session.isNull("role")) state.put("role", session.getString("role"))
    }
    state.put("role", "member")
    if (patch != null) {
        val keys = patch.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            state.put(key, patch.get(key))
        }
    }
    return state
}

private fun collectionItems(data: JSONObject, key: String): JSONArray {
    val source = data.optJSONArray(key) ?: JSONArray()
    if (key != "coupleMessages") return source
    val mapped = JSONArray()
    for (index in 0 until source.length()) {
        mapped.put(JSONObject(source.getJSONObject(index).toString()).put("status", "synced"))
    }
    return mapped
}

fun buildStudyStats(data: JSONObject, now: Instant = Instant.now()): JSONArray {
    val dates = linkedSetOf<String>()
    val reports = data.optJSONArray("reports") ?: JSONArray()
    for (index in 0 until reports.length()) dates += reports.getJSONObject(index).optString("date")
    val sessions = data.optJSONArray("studySessions") ?: JSONArray()
    for (index in 0 until sessions.length()) dates += sessions.getJSONObject(index).optString("date")
    val stats = JSONArray()
    val updatedAt = iso(now)
    for (date in dates) {
        if (date.isEmpty()) continue
        var studySeconds = 0L
        for (index in 0 until sessions.length()) {
            val session = sessions.getJSONObject(index)
            if (session.optString("date") == date) studySeconds += session.optLong("durationSeconds")
        }
        var reportStudyMinutes = 0.0
        for (index in 0 until reports.length()) {
            val report = reports.getJSONObject(index)
            if (report.optString("date") == date) {
                reportStudyMinutes = report.optDouble("studyMinutes", 0.0)
                break
            }
        }
        val seconds = if (studySeconds != 0L) studySeconds else (reportStudyMinutes * 60).toLong()
        stats.put(
            JSONObject()
                .put("id", "study-stat-$date")
                .put("date", date)
                .put("studySeconds", seconds)
                .put("reportStudyMinutes", reportStudyMinutes)
                .put("updatedAt", updatedAt)
        )
    }
    return stats
}

fun buildOutbox(data: JSONObject, queuedAt: String, now: Instant = Instant.now()): JSONArray {
    val rows = JSONArray()
    for ((key, className) in cloudClasses) {
        val items = collectionItems(data, key)
        for (index in 0 until items.length()) {
            val payload = items.getJSONObject(index)
            val recordId = payload.optString("id")
            rows.put(
                JSONObject()
                    .put("id", "$className:$recordId:$queuedAt")
                    .put("className", className)
                    .put("recordId", recordId)
                    .put("payload", payload)
                    .put("queuedAt", queuedAt)
            )
        }
    }
    val stats = buildStudyStats(data, now)
    for (index in 0 until stats.length()) {
        val payload = stats.getJSONObject(index)
        rows.put(
            JSONObject()
                .put("id", "LoveStudyStat:${payload.optString("id")}:$queuedAt")
                .put("className", "LoveStudyStat")
                .put("recordId", payload.optString("id"))
                .put("payload", payload)
                .put("queuedAt", queuedAt)
        )
    }
    return rows
}

fun queueSyncJob(
    data: JSONObject,
    online: Boolean = true,
    cloudConfigured: Boolean = false,
    session: JSONObject? = null,
    tokenPresent: Boolean = false,
    now: Instant = Instant.now()
): JSONObject {
    val queuedAt = iso(now)
    val copy = JSONObject(data.toString())
    copy.put("cloudOutbox", buildOutbox(copy, queuedAt, now))
    val state = cloudState(cloudConfigured, session, tokenPresent)
    val existing = data.optJSONObject("syncState")
    if (existing != null) {
        val keys = existing.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            state.put(key, existing.get(key))
        }
    }
    val pending = (if (existing == null || !existing.has("pendingJobs") || existing.isNull("pendingJobs")) 0 else existing.optInt("pendingJobs")) + 1
    state.put("schemaVersion", 3)
    state.put("pendingJobs", pending)
    state.put("status", if (online) "idle" else "offline")
    copy.put("syncState", state)
    return copy
}

fun mergeRecords(local: JSONArray, remote: JSONArray): JSONArray {
    val map = linkedMapOf<String, JSONObject>()
    for (index in 0 until local.length()) {
        val item = local.getJSONObject(index)
        map[item.optString("id")] = item
    }
    for (index in 0 until remote.length()) {
        val item = remote.getJSONObject(index)
        if (item.has("deletedAtIso") && !item.isNull("deletedAtIso") && item.optString("deletedAtIso").isNotEmpty()) {
            map.remove(item.optString("id"))
        } else {
            map[item.optString("id")] = item
        }
    }
    val merged = JSONArray()
    map.values.forEach { merged.put(it) }
    return merged
}

fun backupIsValid(backup: JSONObject): Boolean {
    val version = backup.optInt("version", -1)
    return version in listOf(1, 2, 3) &&
        backup.optJSONArray("habits") != null &&
        backup.optJSONArray("checkIns") != null &&
        backup.optJSONArray("reports") != null
}
