package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StorageSyncTest {
    @Test
    fun migratesV1IntoV3() {
        val settings = initialSettings().put("onboarded", true)
        val migrated = normalizeAppData(JSONObject()
            .put("version", 1)
            .put("habits", initialData().getJSONArray("habits"))
            .put("checkIns", JSONArray())
            .put("reports", JSONArray())
            .put("settings", settings))
        assertEquals(3, migrated.getInt("version"))
        assertEquals(0, migrated.getJSONArray("studySessions").length())
        assertEquals("english", migrated.getJSONObject("agentUiState").getString("agent"))
        assertEquals(0, migrated.getJSONObject("syncState").getInt("pendingJobs"))
        assertEquals(3, migrated.getJSONObject("syncState").getInt("schemaVersion"))
        assertEquals("member", migrated.getJSONObject("syncState").getString("role"))
        assertEquals(0, migrated.getJSONArray("taskTemplates").length())
        assertEquals(0, migrated.getJSONArray("dailyTaskRecords").length())
        assertEquals(0, migrated.getJSONArray("dailyStudySummaries").length())
        assertEquals(0, migrated.getJSONArray("customBadgeGifts").length())
        assertEquals(0, migrated.getJSONArray("wordLearningRecords").length())
        assertEquals(0, migrated.getJSONArray("cloudOutbox").length())
        assertEquals(true, migrated.getJSONObject("settings").getBoolean("onboarded"))
    }

    @Test
    fun keepsLocalSyncQueueCount() {
        val queued = queueSyncJob(initialData().put("syncState", JSONObject()
            .put("enabled", true)
            .put("configured", true)
            .put("status", "idle")
            .put("pendingJobs", 1)))
        assertEquals(2, queued.getJSONObject("syncState").getInt("pendingJobs"))
        assertTrue(queued.getJSONObject("syncState").getString("status") in setOf("idle", "offline"))
    }

    @Test
    fun keepsLegacyCouplePostsWithoutSocialFields() {
        val migrated = normalizeAppData(initialData().put("couplePosts", JSONArray().put(JSONObject()
            .put("id", "legacy-post")
            .put("author", "陶陶")
            .put("text", "旧动态")
            .put("date", "2026-06-08")
            .put("createdAt", "2026-06-08T12:00:00.000Z"))))
        val post = migrated.getJSONArray("couplePosts").getJSONObject(0)
        assertEquals("legacy-post", post.getString("id"))
        assertEquals("陶陶", post.getString("author"))
        assertEquals("旧动态", post.getString("text"))
        assertFalse(post.has("photoIds"))
        assertFalse(post.has("likes"))
        assertFalse(post.has("comments"))
    }

    @Test
    fun queuesRecordsWithoutApiKeys() {
        val queued = queueSyncJob(initialData()
            .put("reports", JSONArray().put(JSONObject()
                .put("id", "report-1")
                .put("date", "2026-06-08")
                .put("mood", "元气满满")
                .put("studyMinutes", 30)
                .put("lifeNote", "ok")
                .put("message", "done")
                .put("submittedAt", "2026-06-08T12:00:00.000Z")))
            .put("couplePosts", JSONArray().put(JSONObject()
                .put("id", "post-1")
                .put("author", "me")
                .put("authorProfile", "ru")
                .put("text", "hello")
                .put("photoIds", JSONArray().put("post-photo-1"))
                .put("likes", JSONArray().put("taotao"))
                .put("comments", JSONArray().put(JSONObject()
                    .put("id", "comment-1")
                    .put("authorProfile", "taotao")
                    .put("author", "陶陶")
                    .put("text", "好看")
                    .put("createdAt", "2026-06-08T12:01:00.000Z")))
                .put("date", "2026-06-08")
                .put("createdAt", "2026-06-08T12:00:00.000Z")))
            .put("settings", initialSettings()
                .put("deepSeekApiKey", "secret-deepseek")
                .put("qwenApiKey", "secret-qwen")
                .put("serperApiKey", "secret-serper"))
            .put("syncState", JSONObject()
                .put("enabled", true)
                .put("configured", true)
                .put("status", "idle")
                .put("role", "owner")
                .put("schemaVersion", 3)
                .put("lastPulledAtByClass", JSONObject())
                .put("pendingJobs", 0)))
        val serialized = queued.getJSONArray("cloudOutbox").toString()
        val names = classNames(queued.getJSONArray("cloudOutbox"))
        assertTrue(names.contains("LoveDailyReport"))
        assertTrue(names.contains("LoveCouplePost"))
        assertTrue(names.contains("LoveStudyStat"))
        assertTrue(serialized.contains("post-photo-1"))
        assertTrue(serialized.contains("comment-1"))
        assertFalse(serialized.contains("secret-deepseek"))
        assertFalse(serialized.contains("secret-qwen"))
        assertFalse(serialized.contains("secret-serper"))
    }

    @Test
    fun migratesLegacySupervisorWithFullWrites() {
        val queued = queueSyncJob(initialData()
            .put("reports", JSONArray().put(JSONObject()
                .put("id", "report-1")
                .put("date", "2026-06-08")
                .put("mood", "元气满满")
                .put("studyMinutes", 30)
                .put("lifeNote", "private")
                .put("message", "private")
                .put("submittedAt", "2026-06-08T12:00:00.000Z")))
            .put("feedWishes", JSONArray().put(JSONObject()
                .put("id", "feed-1")
                .put("author", "supervisor")
                .put("craving", "tea")
                .put("note", "")
                .put("priority", "want")
                .put("date", "2026-06-08")
                .put("fulfilled", false)
                .put("createdAt", "2026-06-08T12:00:00.000Z")
                .put("updatedAt", "2026-06-08T12:00:00.000Z")))
            .put("syncState", JSONObject()
                .put("enabled", true)
                .put("configured", true)
                .put("status", "idle")
                .put("role", "supervisor")
                .put("schemaVersion", 3)
                .put("lastPulledAtByClass", JSONObject())
                .put("pendingJobs", 0)))
        val names = classNames(queued.getJSONArray("cloudOutbox"))
        assertTrue(names.contains("LoveFeedWish"))
        assertTrue(names.contains("LoveDailyReport"))
        assertTrue(names.contains("LoveStudyStat"))
    }

    private fun classNames(outbox: JSONArray): Set<String> {
        return buildSet {
            for (index in 0 until outbox.length()) add(outbox.getJSONObject(index).getString("className"))
        }
    }
}
