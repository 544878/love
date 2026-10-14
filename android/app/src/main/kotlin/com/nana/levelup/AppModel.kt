package com.nana.levelup

import android.app.Application
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.nana.levelup.logic.buildOutbox
import com.nana.levelup.logic.finishStudyTimer
import com.nana.levelup.logic.iso
import com.nana.levelup.logic.localDate
import com.nana.levelup.logic.pauseStudyTimer
import com.nana.levelup.logic.queueSyncJob
import com.nana.levelup.logic.resumeStudyTimer
import com.nana.levelup.logic.startStudyTimer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.time.Instant

class AppModel(app: Application) : AndroidViewModel(app) {
    val repository = AppRepository(app)
    val cloud = CloudClient(BuildConfig.CLOUD_API_URL, repository)
    val agents = AgentClient()
    private val automations = DailyAutomation(app, agents)

    var data by mutableStateOf<JSONObject?>(null)
        private set
    var page by mutableStateOf("today")
    var selectedDate by mutableStateOf(localDate())
    var toast by mutableStateOf("")
    var now by mutableStateOf(Instant.now())
    var refreshing by mutableStateOf(false)
    var busy by mutableStateOf(false)

    private val pages = setOf("today", "journal", "study", "coach", "chat", "moments", "calendar", "growth", "couple", "settings", "automation")

    init {
        viewModelScope.launch {
            val loaded = withContext(Dispatchers.IO) { repository.load(app) }
            page = repository.readPage()?.takeIf { it in pages } ?: "today"
            selectedDate = repository.readDate()?.takeIf { it.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) } ?: localDate()
            data = loaded
            if (loaded.getJSONObject("settings").optBoolean("onboarded")) refreshAutomations(false)
        }
        viewModelScope.launch {
            while (true) {
                delay(1000)
                now = Instant.now()
            }
        }
        viewModelScope.launch {
            while (true) {
                delay(4500)
                val current = data ?: continue
                val sync = current.optJSONObject("syncState") ?: continue
                if (sync.optBoolean("enabled") && sync.optInt("pendingJobs") > 0 && sync.optString("status") != "syncing") {
                    syncNow()
                }
            }
        }
        viewModelScope.launch {
            while (true) {
                delay(30_000)
                pullShared()
            }
        }
    }

    fun open(next: String) {
        page = next
        persistUi()
    }

    fun selectDate(date: String) {
        selectedDate = date
        persistUi()
    }

    fun notify(message: String) {
        toast = message
        viewModelScope.launch {
            delay(2400)
            if (toast == message) toast = ""
        }
    }

    fun edit(sync: Boolean = true, block: (JSONObject) -> Unit) {
        val current = data ?: return
        val next = JSONObject(current.toString())
        block(next)
        val queued = if (sync && next.optJSONObject("syncState")?.optBoolean("enabled") == true) {
            val withOutbox = JSONObject(next.toString())
            if ((withOutbox.optJSONArray("cloudOutbox")?.length() ?: 0) == 0) {
                withOutbox.put("cloudOutbox", buildOutbox(withOutbox, iso(Instant.now())))
            }
            queueSyncJob(withOutbox, online(), cloud.configured(), repository.readSession(), repository.readToken() != null)
        } else {
            next
        }
        data = queued
        viewModelScope.launch(Dispatchers.IO) { repository.save(queued) }
    }

    fun profile(): String = data?.getJSONObject("settings")?.optString("activeProfile").orEmpty().ifEmpty { "ru" }

    fun beginTimer(title: String, note: String) {
        edit { it.put("activeStudyTimer", startStudyTimer(title, note, Instant.now(), profile())) }
    }

    fun pauseTimer() {
        edit { current ->
            val timer = current.optJSONObject("activeStudyTimer") ?: return@edit
            current.put("activeStudyTimer", pauseStudyTimer(timer, Instant.now()))
        }
    }

    fun resumeTimer() {
        edit { current ->
            val timer = current.optJSONObject("activeStudyTimer") ?: return@edit
            current.put("activeStudyTimer", resumeStudyTimer(timer, Instant.now()))
        }
    }

    fun finishTimer() {
        edit { current ->
            val timer = current.optJSONObject("activeStudyTimer") ?: return@edit
            val session = finishStudyTimer(timer, Instant.now())
            val sessions = org.json.JSONArray().put(session)
            val existing = current.optJSONArray("studySessions")
            if (existing != null) for (index in 0 until existing.length()) sessions.put(existing.get(index))
            current.put("studySessions", sessions)
            current.remove("activeStudyTimer")
        }
        notify("本次学习已经记录到本地")
    }

    fun refreshAutomations(force: Boolean) {
        val current = data ?: return
        if (!current.getJSONObject("settings").optBoolean("onboarded") || refreshing) return
        val today = localDate()
        val cached = (0 until (current.optJSONArray("dailyBriefs")?.length() ?: 0))
            .map { current.getJSONArray("dailyBriefs").getJSONObject(it) }
            .firstOrNull { it.optString("date") == today }
        if (!force && cached != null) {
            val generatedAt = runCatching { Instant.parse(cached.optString("generatedAt")) }.getOrNull()
            if (generatedAt != null && Instant.now().toEpochMilli() - generatedAt.toEpochMilli() < 6 * 60 * 60 * 1000) {
                viewModelScope.launch(Dispatchers.IO) {
                    val scheduled = automations.reschedule(current)
                    withContext(Dispatchers.Main) { data = scheduled; repository.save(scheduled) }
                }
                return
            }
        }
        refreshing = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val (refreshed, warning) = automations.refresh(current)
                val merged = com.nana.levelup.logic.mergeAutomationRefresh(data ?: current, refreshed)
                val queued = if (merged.optJSONObject("syncState")?.optBoolean("enabled") == true) {
                    queueSyncJob(merged, online(), cloud.configured(), repository.readSession(), repository.readToken() != null)
                } else merged
                withContext(Dispatchers.Main) {
                    data = queued
                    if (!warning.isNullOrBlank()) notify(warning)
                }
                repository.save(queued)
            } catch (_: Exception) {
                withContext(Dispatchers.Main) { notify("今天的小自动化暂时没刷新，稍后再试试") }
            } finally {
                withContext(Dispatchers.Main) { refreshing = false }
            }
        }
    }

    fun syncNow() {
        val current = data ?: return
        viewModelScope.launch {
            val syncing = JSONObject(current.toString())
            syncing.put("syncState", JSONObject(current.getJSONObject("syncState").toString()).put("status", "syncing"))
            data = syncing
            val result = withContext(Dispatchers.IO) { cloud.syncNow(current, online()) }
            data = result
            withContext(Dispatchers.IO) { repository.save(result) }
        }
    }

    fun pullShared() {
        val current = data ?: return
        val sync = current.optJSONObject("syncState") ?: return
        if (!sync.optBoolean("enabled") || sync.optInt("pendingJobs") > 0 || !online()) return
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val pulled = cloud.pull(current)
                if (data !== current && data.toString() != current.toString()) return@launch
                val newOrders = (pulled.optJSONArray("feedWishes")?.length() ?: 0) - (current.optJSONArray("feedWishes")?.length() ?: 0)
                val newMessages = (pulled.optJSONArray("coupleMessages")?.length() ?: 0) - (current.optJSONArray("coupleMessages")?.length() ?: 0)
                withContext(Dispatchers.Main) {
                    data = pulled
                    if (newOrders > 0) notify("收到新的投喂订单") else if (newMessages > 0) notify("互动区有新消息")
                }
                repository.save(pulled)
            } catch (_: Exception) {
                // Shared updates retry on the next interval.
            }
        }
    }

    fun login(username: String, password: String, spaceId: String, inviteCode: String?) {
        busy = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val state = cloud.login(username, password, spaceId, inviteCode)
                withContext(Dispatchers.Main) {
                    edit(sync = false) { it.put("syncState", state) }
                    notify("阿里云同步服务已登录")
                }
            } catch (error: Exception) {
                withContext(Dispatchers.Main) { notify(error.message ?: "阿里云同步服务登录失败") }
            } finally {
                withContext(Dispatchers.Main) { busy = false }
            }
        }
    }

    fun logout() {
        viewModelScope.launch(Dispatchers.IO) {
            val state = cloud.logout()
            withContext(Dispatchers.Main) {
                edit(sync = false) { it.put("syncState", state) }
                notify("已退出阿里云同步服务")
            }
        }
    }

    fun pushCloud() {
        val current = data ?: return
        busy = true
        viewModelScope.launch(Dispatchers.IO) {
            val synced = cloud.push(current, online())
            withContext(Dispatchers.Main) {
                data = synced
                busy = false
                notify(if (synced.optJSONObject("syncState")?.optString("status") == "synced") "已同步到阿里云" else synced.optJSONObject("syncState")?.optString("lastError").orEmpty().ifEmpty { "同步未完成" })
            }
            repository.save(synced)
        }
    }

    fun pullCloud() {
        val current = data ?: return
        busy = true
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val pulled = cloud.pull(current)
                withContext(Dispatchers.Main) {
                    data = pulled
                    notify("已从阿里云拉取最新记录")
                }
                repository.save(pulled)
            } catch (error: Exception) {
                withContext(Dispatchers.Main) { notify(error.message ?: "拉取云端数据失败") }
            } finally {
                withContext(Dispatchers.Main) { busy = false }
            }
        }
    }

    fun restore(backup: JSONObject) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val restored = repository.restoreBackup(backup)
                withContext(Dispatchers.Main) {
                    data = restored
                    notify("记录与照片已经完整恢复")
                }
            } catch (error: Exception) {
                withContext(Dispatchers.Main) { notify(error.message ?: "备份恢复失败") }
            }
        }
    }

    fun clearLocal() {
        viewModelScope.launch(Dispatchers.IO) {
            val fresh = repository.clearData()
            withContext(Dispatchers.Main) {
                data = fresh
                notify("本机记录已全部清空")
            }
        }
    }

    fun savePhoto(id: String, dataUrl: String) {
        repository.savePhoto(id, dataUrl)
        viewModelScope.launch(Dispatchers.IO) { cloud.uploadPhoto(id, dataUrl) }
    }

    private fun persistUi() {
        repository.saveUi(page, selectedDate)
    }

    private fun online(): Boolean {
        val manager = getApplication<Application>().getSystemService(ConnectivityManager::class.java) ?: return true
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
