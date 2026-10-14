package com.nana.levelup

import com.nana.levelup.logic.cloudClasses
import com.nana.levelup.logic.cloudState
import com.nana.levelup.logic.mergeRecords
import com.nana.levelup.logic.stripSecretSettings
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class CloudClient(
    private val apiBase: String,
    private val repository: AppRepository
) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    fun configured(): Boolean = apiBase.startsWith("http://") || apiBase.startsWith("https://")

    fun state(patch: JSONObject? = null): JSONObject {
        return cloudState(configured(), repository.readSession(), repository.readToken() != null, patch)
    }

    fun login(username: String, password: String, spaceId: String?, inviteCode: String?): JSONObject {
        val body = JSONObject()
            .put("username", username.trim())
            .put("password", password)
        if (!spaceId.isNullOrBlank()) body.put("spaceId", spaceId.trim())
        if (!inviteCode.isNullOrBlank()) body.put("inviteCode", inviteCode.trim())
        body.put("role", "member")
        val result = request("POST", "/auth/login", body, authorized = false)
        val user = result.getJSONObject("user")
        val space = result.getJSONObject("space")
        val session = JSONObject()
            .put("currentUser", user.optString("username"))
            .put("spaceId", space.optString("id"))
            .put("role", space.optString("role").ifEmpty { "member" })
        if (space.has("inviteCode") && !space.isNull("inviteCode")) session.put("inviteCode", space.getString("inviteCode"))
        repository.saveSession(result.getString("token"), session)
        return state(JSONObject().put("enabled", true).put("status", "idle").put("currentUser", session.optString("currentUser")).put("spaceId", session.optString("spaceId")).put("inviteCode", session.optString("inviteCode")))
    }

    fun logout(): JSONObject {
        try {
            if (repository.readToken() != null) request("POST", "/auth/logout", JSONObject(), authorized = true)
        } catch (_: Exception) {
            // Local logout still works while the server is unavailable.
        }
        repository.clearSession()
        return state(JSONObject().put("enabled", false).put("status", "signed-out"))
    }

    fun push(data: JSONObject, online: Boolean): JSONObject {
        if (repository.readToken() == null) {
            val failed = JSONObject(data.toString())
            val state = JSONObject(data.optJSONObject("syncState")?.toString() ?: state().toString())
            state.put("configured", configured())
            state.put("enabled", false)
            state.put("status", if (configured()) "signed-out" else "failed")
            state.put("schemaVersion", 3)
            state.put("lastError", if (configured()) "尚未登录阿里云同步服务" else "阿里云同步服务尚未配置")
            failed.put("syncState", state)
            return failed
        }
        return try {
            val spaceId = data.optJSONObject("syncState")?.optString("spaceId").orEmpty().ifEmpty { repository.readSession()?.optString("spaceId").orEmpty() }
            val outbox = data.optJSONArray("cloudOutbox") ?: JSONArray()
            request("POST", "/sync/push", JSONObject().put("spaceId", spaceId).put("records", outbox), authorized = true)
            val next = JSONObject(data.toString())
            val sessions = JSONArray()
            val sourceSessions = next.optJSONArray("studySessions") ?: JSONArray()
            for (index in 0 until sourceSessions.length()) {
                sessions.put(JSONObject(sourceSessions.getJSONObject(index).toString()).put("syncStatus", "synced"))
            }
            next.put("studySessions", sessions)
            val messages = JSONArray()
            val sourceMessages = next.optJSONArray("coupleMessages") ?: JSONArray()
            for (index in 0 until sourceMessages.length()) {
                val item = JSONObject(sourceMessages.getJSONObject(index).toString())
                if (item.optString("status") == "sending") item.put("status", "synced")
                messages.put(item)
            }
            next.put("coupleMessages", messages)
            next.put("cloudOutbox", JSONArray())
            val role = data.optJSONObject("syncState")?.optString("role").orEmpty().ifEmpty { "member" }
            next.put("syncState", state(JSONObject()
                .put("enabled", true)
                .put("status", "synced")
                .put("role", role)
                .put("spaceId", spaceId)
                .put("lastPulledAtByClass", data.optJSONObject("syncState")?.optJSONObject("lastPulledAtByClass") ?: JSONObject())
                .put("lastSyncedAt", com.nana.levelup.logic.iso(java.time.Instant.now()))
                .put("pendingJobs", 0)))
            next
        } catch (error: Exception) {
            val failed = JSONObject(data.toString())
            val messages = JSONArray()
            val sourceMessages = failed.optJSONArray("coupleMessages") ?: JSONArray()
            for (index in 0 until sourceMessages.length()) {
                val item = JSONObject(sourceMessages.getJSONObject(index).toString())
                if (item.optString("status") == "sending") item.put("status", "failed")
                messages.put(item)
            }
            failed.put("coupleMessages", messages)
            val state = JSONObject(data.optJSONObject("syncState")?.toString() ?: state().toString())
            state.put("configured", configured())
            state.put("enabled", true)
            state.put("status", if (online) "failed" else "offline")
            state.put("schemaVersion", 3)
            state.put("lastError", error.message ?: "阿里云同步失败")
            state.put("pendingJobs", kotlin.math.max(1, data.optJSONObject("syncState")?.optInt("pendingJobs") ?: 1))
            failed.put("syncState", state)
            failed
        }
    }

    fun pull(localData: JSONObject): JSONObject {
        if (repository.readToken() == null) throw IllegalStateException("请先登录阿里云同步服务")
        val spaceId = localData.optJSONObject("syncState")?.optString("spaceId").orEmpty().ifEmpty { repository.readSession()?.optString("spaceId").orEmpty() }
        val role = localData.optJSONObject("syncState")?.optString("role").orEmpty().ifEmpty { "member" }
        val cursors = JSONObject(localData.optJSONObject("syncState")?.optJSONObject("lastPulledAtByClass")?.toString() ?: "{}")
        val result = request("POST", "/sync/pull", JSONObject().put("spaceId", spaceId).put("cursors", cursors), authorized = true)
        val collections = result.optJSONObject("collections") ?: JSONObject()
        val next = JSONObject(localData.toString())
        for ((key, className) in cloudClasses) {
            val collection = collections.optJSONObject(className) ?: continue
            val payloads = collection.optJSONArray("payloads") ?: JSONArray()
            if (payloads.length() > 0) {
                next.put(key, mergeRecords(next.optJSONArray(key) ?: JSONArray(), payloads))
            }
            val latest = collection.optString("latest")
            if (latest.isNotEmpty()) cursors.put(className, latest)
        }
        val statsLatest = collections.optJSONObject("LoveStudyStat")?.optString("latest").orEmpty()
        if (statsLatest.isNotEmpty()) cursors.put("LoveStudyStat", statsLatest)
        val settings = JSONObject(next.getJSONObject("settings").toString())
        val localSettings = localData.getJSONObject("settings")
        settings.put("deepSeekApiKey", localSettings.optString("deepSeekApiKey"))
        settings.put("qwenApiKey", localSettings.optString("qwenApiKey"))
        settings.put("serperApiKey", localSettings.optString("serperApiKey"))
        next.put("version", 3)
        next.put("settings", settings)
        next.put("syncState", state(JSONObject()
            .put("enabled", true)
            .put("status", "synced")
            .put("role", role)
            .put("spaceId", spaceId)
            .put("lastPulledAtByClass", cursors)
            .put("lastPulledAt", com.nana.levelup.logic.iso(java.time.Instant.now()))
            .put("pendingJobs", 0)))
        return next
    }

    fun syncNow(data: JSONObject, online: Boolean): JSONObject {
        val sanitized = JSONObject(data.toString())
        sanitized.put("settings", stripSecretSettings(data.getJSONObject("settings")))
        val pushed = push(sanitized, online)
        if (pushed.optJSONObject("syncState")?.optString("status") != "synced") return pushed
        val restored = JSONObject(pushed.toString())
        restored.put("settings", data.getJSONObject("settings"))
        return pull(restored)
    }

    fun uploadPhoto(id: String, dataUrl: String) {
        if (repository.readToken() == null) return
        try {
            val spaceId = repository.readSession()?.optString("spaceId").orEmpty()
            request("POST", "/photos", JSONObject().put("spaceId", spaceId).put("id", id).put("dataUrl", dataUrl), authorized = true)
        } catch (_: Exception) {
            // The local photo file remains the source of truth.
        }
    }

    fun downloadPhoto(id: String): String? {
        if (repository.readToken() == null) return null
        return try {
            val spaceId = java.net.URLEncoder.encode(repository.readSession()?.optString("spaceId").orEmpty(), "UTF-8")
            val encodedId = java.net.URLEncoder.encode(id, "UTF-8")
            request("GET", "/photos/$encodedId?spaceId=$spaceId", null, authorized = true).optString("dataUrl").ifEmpty { null }
        } catch (_: Exception) {
            null
        }
    }

    private fun request(method: String, path: String, body: JSONObject?, authorized: Boolean): JSONObject {
        if (!configured()) throw IllegalStateException("阿里云同步服务尚未配置")
        val builder = Request.Builder().url(apiBase.trimEnd('/') + path)
        if (authorized) repository.readToken()?.let { builder.header("Authorization", "Bearer $it") }
        if (method == "GET") builder.get() else builder.method(method, (body ?: JSONObject()).toString().toRequestBody(jsonType))
        http.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val payload = if (text.isBlank()) JSONObject() else JSONObject(text)
            if (!response.isSuccessful) {
                if (response.code == 401) repository.clearSession()
                throw IllegalStateException(payload.optString("error").ifEmpty { "云端请求失败（${response.code}）" })
            }
            return payload
        }
    }
}
