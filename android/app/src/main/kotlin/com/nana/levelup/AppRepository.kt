package com.nana.levelup

import android.content.Context
import com.nana.levelup.logic.backupIsValid
import com.nana.levelup.logic.initialData
import com.nana.levelup.logic.normalizeAppData
import com.nana.levelup.logic.stripSecretSettings
import org.json.JSONObject
import java.io.File

class AppRepository(context: Context) {
    private val root = File(context.filesDir, "lovelog").apply { mkdirs() }
    private val dataFile = File(root, "app-data.json")
    private val sessionFile = File(root, "cloud-session.json")
    private val photoDir = File(root, "photos").apply { mkdirs() }
    private val preferences = context.getSharedPreferences("lovelog-ui", Context.MODE_PRIVATE)
    private val migration = LegacyWebMigration()

    suspend fun load(context: Context): JSONObject {
        if (dataFile.exists()) return normalizeAppData(JSONObject(dataFile.readText()))
        val imported = migration.importExisting(context)
        imported?.photos?.keys()?.let { keys ->
            while (keys.hasNext()) {
                val id = keys.next()
                val value = imported.photos.optString(id)
                if (value.startsWith("data:image/")) savePhoto(id, value)
            }
        }
        if (!imported?.token.isNullOrBlank() && !imported?.session.isNullOrBlank()) {
            saveSession(imported!!.token!!, JSONObject(imported.session))
        }
        imported?.page?.let { preferences.edit().putString(PAGE_KEY, it).apply() }
        imported?.date?.let { preferences.edit().putString(DATE_KEY, it).apply() }
        val data = normalizeAppData(imported?.data)
        if (imported?.data == null) {
            save(initialData().let { normalizeAppData(it) })
            return normalizeAppData(JSONObject(dataFile.readText()))
        }
        save(data)
        return data
    }

    fun save(data: JSONObject) {
        val normalized = normalizeAppData(data)
        root.mkdirs()
        val temporary = File(root, "app-data.json.tmp")
        temporary.writeText(normalized.toString())
        if (!temporary.renameTo(dataFile)) {
            dataFile.writeText(normalized.toString())
            temporary.delete()
        }
    }

    fun readPage(): String? = preferences.getString(PAGE_KEY, null)

    fun readDate(): String? = preferences.getString(DATE_KEY, null)

    fun saveUi(page: String, date: String) {
        preferences.edit().putString(PAGE_KEY, page).putString(DATE_KEY, date).apply()
    }

    fun savePhoto(id: String, dataUrl: String) {
        photoFile(id).writeText(dataUrl)
    }

    fun getPhoto(id: String?): String? {
        if (id.isNullOrBlank()) return null
        val file = photoFile(id)
        return if (file.exists()) file.readText() else null
    }

    fun deletePhoto(id: String?) {
        if (id.isNullOrBlank()) return
        photoFile(id).delete()
    }

    fun clearPhotos() {
        photoDir.listFiles()?.forEach { it.delete() }
    }

    fun allPhotos(): JSONObject {
        val photos = JSONObject()
        photoDir.listFiles()?.forEach { file ->
            val id = decodeId(file.name)
            photos.put(id, file.readText())
        }
        return photos
    }

    fun createBackup(data: JSONObject): JSONObject {
        val normalized = normalizeAppData(data)
        val settings = stripSecretSettings(normalized.getJSONObject("settings"))
        normalized.put("settings", settings)
        normalized.put("exportedAt", java.time.Instant.now().let { com.nana.levelup.logic.iso(it) })
        normalized.put("photos", allPhotos())
        return normalized
    }

    fun restoreBackup(backup: JSONObject): JSONObject {
        if (!backupIsValid(backup)) throw IllegalArgumentException("这不是有效的成长日记备份")
        clearPhotos()
        val photos = backup.optJSONObject("photos") ?: JSONObject()
        val keys = photos.keys()
        while (keys.hasNext()) {
            val id = keys.next()
            val value = photos.optString(id)
            if (value.isNotEmpty()) savePhoto(id, value)
        }
        val data = normalizeAppData(backup)
        save(data)
        return data
    }

    fun clearData(): JSONObject {
        clearPhotos()
        dataFile.delete()
        val fresh = normalizeAppData(initialData())
        fresh.getJSONObject("settings").put("onboarded", true)
        save(fresh)
        return normalizeAppData(JSONObject(dataFile.readText()))
    }

    fun readToken(): String? = readSessionFile().optString("token").ifEmpty { null }

    fun readSession(): JSONObject? = readSessionFile().optJSONObject("session")

    fun saveSession(token: String, session: JSONObject) {
        sessionFile.writeText(JSONObject().put("token", token).put("session", session).toString())
    }

    fun clearSession() {
        sessionFile.delete()
    }

    private fun readSessionFile(): JSONObject {
        if (!sessionFile.exists()) return JSONObject()
        return try {
            JSONObject(sessionFile.readText())
        } catch (_: Exception) {
            JSONObject()
        }
    }

    private fun photoFile(id: String): File = File(photoDir, encodeId(id))

    private fun encodeId(id: String): String = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(id.toByteArray())

    private fun decodeId(name: String): String = String(java.util.Base64.getUrlDecoder().decode(name))

    private companion object {
        const val PAGE_KEY = "lovelog.ui.page"
        const val DATE_KEY = "lovelog.ui.date"
    }
}
