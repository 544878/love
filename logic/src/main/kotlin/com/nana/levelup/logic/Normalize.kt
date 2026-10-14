package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

fun initialSettings(): JSONObject {
    return JSONObject()
        .put("onboarded", false)
        .put("ownerName", "张洳娜")
        .put("partnerName", "程韵陶")
        .put("companionAlias", "陶陶")
        .put("theme", "rose")
        .put("currentWeightJin", 98)
        .put("targetSchool", "南京师范大学")
        .put("targetMajor", "英语文学系")
        .put("deepSeekApiKey", "")
        .put("deepSeekBaseUrl", "https://api.deepseek.com")
        .put("deepSeekModel", "deepseek-v4-pro")
        .put("deepSeekTemperature", 0.55)
        .put("deepSeekMaxOutputTokens", 65536)
        .put("agentContextLimitChars", 800000)
        .put("agentThinking", "deep")
        .put("agentWebSearch", true)
        .put("agentFileUpload", true)
        .put("serperApiKey", "")
        .put("serperEndpoint", "https://google.serper.dev/search")
        .put("qwenApiKey", "")
        .put("qwenBaseUrl", "https://dashscope.aliyuncs.com/compatible-mode/v1")
        .put("qwenOcrModel", "qwen-vl-ocr")
        .put("qwenEmbeddingModel", "text-embedding-v4")
        .put("qwenEmbeddingDimensions", 256)
        .put("qwenRerankEndpoint", "https://dashscope.aliyuncs.com/compatible-api/v1/reranks")
        .put("qwenRerankModel", "qwen3-rerank")
        .put("qwenRerankEnabled", true)
        .put("qwenTtsEndpoint", "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation")
        .put("qwenTtsModel", "qwen3-tts-flash")
        .put("qwenTtsVoice", "Cherry")
        .put("voiceOutput", true)
        .put("foodAvoids", "")
        .put("foodRecentDislikes", "")
        .put("weatherFallbackCity", "天津")
        .put("notificationPermission", "prompt")
        .put("activeProfile", "ru")
        .put("aiProvider", "deepseek")
        .put("qwenChatModel", "qwen-max")
        .put("qwenVisionModel", "qwen-vl-max")
        .put("dailyStudySummaryEnabled", true)
}

fun defaultAutomations(now: Instant = Instant.now()): JSONArray {
    val createdAt = iso(now)
    fun rule(id: String, kind: String, title: String, prompt: String, time: String, tone: String, webSearch: Boolean): JSONObject {
        return JSONObject()
            .put("id", id)
            .put("kind", kind)
            .put("enabled", true)
            .put("title", title)
            .put("prompt", prompt)
            .put("time", time)
            .put("days", JSONArray(listOf(0, 1, 2, 3, 4, 5, 6)))
            .put("tone", tone)
            .put("webSearch", webSearch)
            .put("notify", true)
            .put("createdAt", createdAt)
    }
    return JSONArray()
        .put(rule("daily-weather", "weather", "今日天气小贴士", "根据天气给出穿衣、带伞和出行提示。", "07:30", "温柔", false))
        .put(rule("taotao-message", "companion", "陶陶今天想说", "写一句来自陶陶的寄语，励志、幽默、安慰和温柔轮换，不说教。", "08:00", "温柔", true))
        .put(rule("gentle-meal", "food", "好好吃饭提醒", "温柔提醒她按时吃饭，搭配主食、蛋白质和蔬果。", "12:00", "温柔", false))
        .put(rule("study-review", "study", "今日轻复盘", "提醒她记录实际完成了什么，不评价效率，也不把明天排满。", "20:30", "安慰", false))
}

fun initialData(now: Instant = Instant.now(), today: String = localDate()): JSONObject {
    return JSONObject()
        .put("version", 3)
        .put("habits", JSONArray())
        .put("checkIns", JSONArray())
        .put("reports", JSONArray())
        .put("knowledgeFiles", JSONArray())
        .put("agentConversations", JSONArray())
        .put("automations", defaultAutomations(now))
        .put("automationRuns", JSONArray())
        .put("dailyBriefs", JSONArray())
        .put("studySessions", JSONArray())
        .put("agentUiState", JSONObject()
            .put("agent", "english")
            .put("chatDate", "")
            .put("activeConversationId", "")
            .put("questionDraft", "")
            .put("imageTextDraft", ""))
        .put("syncState", JSONObject()
            .put("enabled", false)
            .put("configured", false)
            .put("status", "signed-out")
            .put("pendingJobs", 0))
        .put("couplePosts", JSONArray())
        .put("sharedCourses", JSONArray())
        .put("feedWishes", JSONArray())
        .put("coupleEvents", JSONArray())
        .put("todos", JSONArray())
        .put("coupleMessages", JSONArray())
        .put("coupleGames", JSONArray())
        .put("studyMetrics", JSONArray())
        .put("wordLearningRecords", JSONArray())
        .put("taskTemplates", JSONArray())
        .put("dailyTaskRecords", JSONArray())
        .put("dailyStudySummaries", JSONArray())
        .put("customBadgeGifts", JSONArray())
        .put("settings", initialSettings())
        .also { it.getJSONObject("agentUiState").put("chatDate", "") }
        .also { _ -> }
        .let { data ->
            data.getJSONObject("agentUiState").put("chatDate", "")
            data
        }
}

private fun arrayOr(parsed: JSONObject, key: String, fallback: JSONArray): JSONArray {
    val value = parsed.opt(key)
    return if (value is JSONArray) value else fallback
}

private fun copyIfPresent(target: JSONObject, source: JSONObject?, key: String) {
    if (source != null && source.has(key) && !source.isNull(key)) target.put(key, source.get(key))
}

fun normalizeAppData(raw: JSONObject?, today: String = localDate(), now: Instant = Instant.now()): JSONObject {
    val parsed = raw ?: JSONObject()
    val settings = initialSettings()
    val parsedSettings = parsed.optJSONObject("settings")
    if (parsedSettings != null) {
        val keys = parsedSettings.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            settings.put(key, parsedSettings.get(key))
        }
    }
    val incomingAgent = parsed.optJSONObject("agentUiState")
    val agent = JSONObject()
        .put("agent", incomingAgent?.optString("agent").takeUnless { it.isNullOrEmpty() } ?: "english")
        .put("chatDate", incomingAgent?.optString("chatDate").takeUnless { it.isNullOrEmpty() } ?: today)
        .put("activeConversationId", if (incomingAgent == null || !incomingAgent.has("activeConversationId") || incomingAgent.isNull("activeConversationId")) "" else incomingAgent.getString("activeConversationId"))
        .put("questionDraft", if (incomingAgent == null || !incomingAgent.has("questionDraft") || incomingAgent.isNull("questionDraft")) "" else incomingAgent.optString("questionDraft"))
        .put("imageTextDraft", if (incomingAgent == null || !incomingAgent.has("imageTextDraft") || incomingAgent.isNull("imageTextDraft")) "" else incomingAgent.optString("imageTextDraft"))
    if (incomingAgent != null && incomingAgent.has("imagePreview") && !incomingAgent.isNull("imagePreview")) {
        agent.put("imagePreview", incomingAgent.get("imagePreview"))
    }
    val incomingSync = parsed.optJSONObject("syncState")
    val sync = JSONObject()
        .put("enabled", incomingSync?.optBoolean("enabled", false) ?: false)
        .put("configured", incomingSync?.optBoolean("configured", false) ?: false)
        .put("status", incomingSync?.optString("status").takeUnless { it.isNullOrEmpty() } ?: "signed-out")
        .put("role", "member")
    copyIfPresent(sync, incomingSync, "currentUser")
    copyIfPresent(sync, incomingSync, "spaceId")
    copyIfPresent(sync, incomingSync, "inviteCode")
    sync.put("schemaVersion", 3)
    sync.put("lastPulledAtByClass", incomingSync?.optJSONObject("lastPulledAtByClass") ?: JSONObject())
    copyIfPresent(sync, incomingSync, "lastSyncedAt")
    copyIfPresent(sync, incomingSync, "lastPulledAt")
    copyIfPresent(sync, incomingSync, "lastError")
    sync.put("pendingJobs", if (incomingSync == null || !incomingSync.has("pendingJobs") || incomingSync.isNull("pendingJobs")) 0 else incomingSync.optInt("pendingJobs"))

    val normalized = JSONObject()
        .put("version", 3)
        .put("habits", arrayOr(parsed, "habits", JSONArray()))
        .put("checkIns", arrayOr(parsed, "checkIns", JSONArray()))
        .put("reports", arrayOr(parsed, "reports", JSONArray()))
        .put("knowledgeFiles", arrayOr(parsed, "knowledgeFiles", JSONArray()))
        .put("agentConversations", arrayOr(parsed, "agentConversations", JSONArray()))
        .put("automations", arrayOr(parsed, "automations", defaultAutomations(now)))
        .put("automationRuns", arrayOr(parsed, "automationRuns", JSONArray()))
        .put("dailyBriefs", arrayOr(parsed, "dailyBriefs", JSONArray()))
        .put("studySessions", arrayOr(parsed, "studySessions", JSONArray()))
        .put("agentUiState", agent)
        .put("syncState", sync)
        .put("couplePosts", arrayOr(parsed, "couplePosts", JSONArray()))
        .put("sharedCourses", arrayOr(parsed, "sharedCourses", JSONArray()))
        .put("feedWishes", arrayOr(parsed, "feedWishes", JSONArray()))
        .put("coupleEvents", arrayOr(parsed, "coupleEvents", JSONArray()))
        .put("todos", arrayOr(parsed, "todos", JSONArray()))
        .put("coupleMessages", arrayOr(parsed, "coupleMessages", JSONArray()))
        .put("coupleGames", arrayOr(parsed, "coupleGames", JSONArray()))
        .put("studyMetrics", arrayOr(parsed, "studyMetrics", JSONArray()))
        .put("wordLearningRecords", arrayOr(parsed, "wordLearningRecords", JSONArray()))
        .put("taskTemplates", arrayOr(parsed, "taskTemplates", JSONArray()))
        .put("dailyTaskRecords", arrayOr(parsed, "dailyTaskRecords", JSONArray()))
        .put("dailyStudySummaries", arrayOr(parsed, "dailyStudySummaries", JSONArray()))
        .put("customBadgeGifts", arrayOr(parsed, "customBadgeGifts", JSONArray()))
        .put("cloudOutbox", arrayOr(parsed, "cloudOutbox", JSONArray()))
        .put("settings", settings)
    if (parsed.has("activeStudyTimer") && !parsed.isNull("activeStudyTimer")) {
        normalized.put("activeStudyTimer", parsed.get("activeStudyTimer"))
    }
    return normalized
}

fun stripSecretSettings(settings: JSONObject): JSONObject {
    return JSONObject(settings.toString())
        .put("deepSeekApiKey", "")
        .put("qwenApiKey", "")
        .put("serperApiKey", "")
}

fun restoreKeepsSecrets(local: JSONObject, remoteSettings: JSONObject): JSONObject {
    return JSONObject(remoteSettings.toString()).apply {
        put("deepSeekApiKey", local.optString("deepSeekApiKey"))
        put("qwenApiKey", local.optString("qwenApiKey"))
        put("serperApiKey", local.optString("serperApiKey"))
    }
}
