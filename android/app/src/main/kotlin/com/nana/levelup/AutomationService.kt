package com.nana.levelup

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.nana.levelup.logic.automationTones
import com.nana.levelup.logic.fallbackCompanionMessage
import com.nana.levelup.logic.localDate
import com.nana.levelup.logic.nextAutomationDates
import com.nana.levelup.logic.notificationDate
import com.nana.levelup.logic.notificationId
import com.nana.levelup.logic.parseLocalDate
import com.nana.levelup.logic.parseMessageBatch
import com.nana.levelup.logic.ruleBody
import com.nana.levelup.logic.shiftDate
import com.nana.levelup.logic.truncateText
import com.nana.levelup.logic.weatherSummary
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.TimeUnit

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra("title") ?: "LoveLog"
        val body = intent.getStringExtra("body") ?: ""
        val id = intent.getIntExtra("nid", 1)
        val manager = context.getSystemService(NotificationManager::class.java)
        ensureChannel(manager)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .build()
        manager.notify(id, notification)
    }

    companion object {
        const val CHANNEL = "nana-daily"

        fun ensureChannel(manager: NotificationManager) {
            if (Build.VERSION.SDK_INT < 26) return
            if (manager.getNotificationChannel(CHANNEL) != null) return
            manager.createNotificationChannel(NotificationChannel(CHANNEL, "LoveLog 每日提醒", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "天气、陶陶寄语和每日温柔提醒"
            })
        }
    }
}

class ReminderScheduler(private val context: Context) {
    private val preferences = context.getSharedPreferences("lovelog-reminders", Context.MODE_PRIVATE)

    fun permission(): String {
        if (Build.VERSION.SDK_INT < 33) return "granted"
        return if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) "granted" else "prompt"
    }

    fun schedule(rules: JSONArray, runs: JSONArray): String {
        val permission = permission()
        if (permission != "granted") return permission
        val manager = context.getSystemService(NotificationManager::class.java)
        ReminderReceiver.ensureChannel(manager)
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        cancel(alarmManager)
        val now = System.currentTimeMillis()
        val ids = mutableListOf<Int>()
        for (index in 0 until runs.length()) {
            val run = runs.getJSONObject(index)
            val rule = (0 until rules.length()).map { rules.getJSONObject(it) }.firstOrNull { it.optString("id") == run.optString("ruleId") } ?: continue
            if (!rule.optBoolean("enabled") || !rule.optBoolean("notify")) continue
            val at = notificationDate(run.optString("date"), rule.optString("time")).timeInMillis
            if (at <= now) continue
            val id = notificationId("${run.optString("ruleId")}:${run.optString("date")}")
            val intent = Intent(context, ReminderReceiver::class.java)
                .putExtra("title", truncateText(run.optString("title"), 40))
                .putExtra("body", truncateText(run.optString("body"), 120))
                .putExtra("nid", id)
            val pending = PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
            ids += id
        }
        preferences.edit().putString("ids", ids.joinToString(",")).apply()
        return "granted"
    }

    private fun cancel(alarmManager: AlarmManager) {
        val stored = preferences.getString("ids", "").orEmpty().split(',').filter { it.isNotBlank() }
        for (id in stored) {
            val intent = Intent(context, ReminderReceiver::class.java)
            val pending = PendingIntent.getBroadcast(context, id.toInt(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            alarmManager.cancel(pending)
        }
    }
}

class DailyAutomation(private val context: Context, private val agents: AgentClient) {
    private val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build()

    fun refresh(data: JSONObject): Pair<JSONObject, String?> {
        val today = localDate()
        val dates = nextAutomationDates(today)
        var warning: String? = null
        var location: LocationFix? = null
        var weather = JSONArray()
        try {
            location = resolveLocation(data.getJSONObject("settings"))
            weather = fetchWeather(location.latitude, location.longitude, location.name, dates)
        } catch (error: Exception) {
            warning = error.message ?: "天气暂时没有刷新"
            weather = cachedWeather(data, dates)
        }
        val settings = data.getJSONObject("settings")
        val generated = companionMessages(settings, dates, weather)
        val briefs = JSONArray()
        val generatedAt = com.nana.levelup.logic.iso(Instant.now())
        dates.forEachIndexed { index, date ->
            val snapshot = weatherObject(weather, date)
            val brief = JSONObject()
                .put("date", date)
                .put("companionMessage", generated.messages[date] ?: fallbackCompanionMessage(date, automationTones[index % automationTones.size], settings.optString("companionAlias").ifEmpty { "陶陶" }))
                .put("tone", automationTones[index % automationTones.size])
                .put("generatedAt", generatedAt)
                .put("source", generated.source)
            if (snapshot != null) brief.put("weather", snapshot)
            briefs.put(brief)
        }
        val runs = JSONArray()
        val rules = data.optJSONArray("automations") ?: JSONArray()
        for (ruleIndex in 0 until rules.length()) {
            val rule = rules.getJSONObject(ruleIndex)
            if (!rule.optBoolean("enabled")) continue
            val days = rule.optJSONArray("days") ?: JSONArray()
            val daySet = buildSet { for (i in 0 until days.length()) add(days.optInt(i)) }
            for (date in dates) {
                if (com.nana.levelup.logic.jsDay(parseLocalDate(date)) !in daySet) continue
                val brief = (0 until briefs.length()).map { briefs.getJSONObject(it) }.first { it.optString("date") == date }
                runs.put(JSONObject()
                    .put("id", "${rule.optString("id")}:$date")
                    .put("ruleId", rule.optString("id"))
                    .put("date", date)
                    .put("title", rule.optString("title"))
                    .put("body", ruleBody(rule, brief, settings))
                    .put("status", "generated")
                    .put("generatedAt", generatedAt))
            }
        }
        var permission = settings.optString("notificationPermission").ifEmpty { "prompt" }
        try {
            permission = ReminderScheduler(context).schedule(rules, runs)
            if (permission == "granted") {
                for (index in 0 until runs.length()) runs.getJSONObject(index).put("status", "scheduled")
            }
        } catch (_: Exception) {
            if (warning == null) warning = "通知暂时没有排好，但今日内容已经保存"
        }
        val cutoff = shiftDate(today, -30)
        val next = JSONObject(data.toString())
        next.put("dailyBriefs", keepRecent(data.optJSONArray("dailyBriefs"), cutoff, today).apply { for (i in 0 until briefs.length()) put(briefs.get(i)) })
        next.put("automationRuns", keepRecent(data.optJSONArray("automationRuns"), cutoff, today).apply { for (i in 0 until runs.length()) put(runs.get(i)) })
        val nextSettings = JSONObject(settings.toString()).put("notificationPermission", permission)
        if (location?.fromDevice == true) {
            nextSettings.put("lastLatitude", location.latitude).put("lastLongitude", location.longitude).put("lastLocationName", location.name)
        }
        next.put("settings", nextSettings)
        return next to warning
    }

    fun reschedule(data: JSONObject): JSONObject {
        val today = localDate()
        val runs = data.optJSONArray("automationRuns") ?: JSONArray()
        val future = JSONArray()
        for (index in 0 until runs.length()) {
            val item = runs.getJSONObject(index)
            if (item.optString("date") >= today) future.put(item)
        }
        val permission = ReminderScheduler(context).schedule(data.optJSONArray("automations") ?: JSONArray(), future)
        val next = JSONObject(data.toString())
        val updated = JSONArray()
        for (index in 0 until runs.length()) {
            val item = JSONObject(runs.getJSONObject(index).toString())
            if (item.optString("date") >= today) item.put("status", if (permission == "granted") "scheduled" else "generated")
            updated.put(item)
        }
        next.put("automationRuns", updated)
        next.put("settings", JSONObject(data.getJSONObject("settings").toString()).put("notificationPermission", permission))
        return next
    }

    private fun companionMessages(settings: JSONObject, dates: List<String>, weather: JSONArray): CompanionBatch {
        val fallback = dates.mapIndexed { index, date ->
            date to fallbackCompanionMessage(date, automationTones[index % automationTones.size], settings.optString("companionAlias").ifEmpty { "陶陶" })
        }.toMap()
        if (settings.optString("deepSeekApiKey").trim().isEmpty()) return CompanionBatch(fallback, "fallback")
        val search = if (settings.optBoolean("agentWebSearch", true)) {
            try { agents.searchWeb(settings, "未来一周 中国 时令 生活 天气 学习 温柔提醒") } catch (_: Exception) { "" }
        } else ""
        val weatherContext = (0 until weather.length()).joinToString("\n") { index ->
            val item = weather.getJSONObject(index)
            "${item.optString("date")} ${item.optString("summary")} ${item.optInt("temperatureMin")}-${item.optInt("temperatureMax")}℃ 降水${item.optInt("precipitationProbability")}%"
        }
        return try {
            val answer = agents.deepSeekText(
                settings,
                "你是陶陶，给正在准备英语文学学习的洳写每日短寄语。只输出严格 JSON 数组，不用 Markdown。每条 35-70 个汉字，不说教、不制造焦虑、不重复。",
                listOf(
                    "日期：${dates.joinToString(", ")}",
                    "语气依次轮换：${dates.indices.joinToString(", ") { automationTones[it % automationTones.size] }}",
                    "天气：\n${weatherContext.ifEmpty { "暂无" }}",
                    if (search.isNotEmpty()) "联网素材，只可提炼不可照抄：\n$search" else "",
                    "格式：[{\"date\":\"YYYY-MM-DD\",\"message\":\"纯文本\"}]"
                ).filter { it.isNotEmpty() }.joinToString("\n\n"),
                1400
            )
            CompanionBatch(fallback + parseMessageBatch(answer, dates).filterValues { it.isNotEmpty() }, "deepseek")
        } catch (_: Exception) {
            CompanionBatch(fallback, "fallback")
        }
    }

    private fun resolveLocation(settings: JSONObject): LocationFix {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            try {
                val manager = context.getSystemService(LocationManager::class.java)
                val location = manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                    ?: manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                if (location != null) return LocationFix(location.latitude, location.longitude, placeName(location) ?: "当前位置", true)
            } catch (_: Exception) {
                // Fall through to the last saved position or the city setting.
            }
        }
        if (settings.has("lastLatitude") && settings.has("lastLongitude")) {
            return LocationFix(settings.optDouble("lastLatitude"), settings.optDouble("lastLongitude"), settings.optString("lastLocationName").ifEmpty { "上次位置" }, false)
        }
        return geocode(settings.optString("weatherFallbackCity").ifEmpty { "天津" })
            ?: throw IllegalStateException("暂时无法获取天气位置，请在设置中填写备用城市")
    }

    private fun placeName(location: Location): String? {
        return try {
            if (Build.VERSION.SDK_INT >= 33) null else {
                @Suppress("DEPRECATION")
                Geocoder(context).getFromLocation(location.latitude, location.longitude, 1)?.firstOrNull()?.locality
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun geocode(city: String): LocationFix? {
        if (city.isBlank()) return null
        val request = Request.Builder().url("https://geocoding-api.open-meteo.com/v1/search?name=${java.net.URLEncoder.encode(city.trim(), "UTF-8")}&count=1&language=zh&format=json").build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return null
            val results = JSONObject(response.body?.string().orEmpty()).optJSONArray("results") ?: return null
            val place = results.optJSONObject(0) ?: return null
            val name = listOf(place.optString("name"), place.optString("admin1")).filter { it.isNotEmpty() }.joinToString(" · ")
            return LocationFix(place.optDouble("latitude"), place.optDouble("longitude"), name, false)
        }
    }

    private fun fetchWeather(latitude: Double, longitude: Double, name: String, dates: List<String>): JSONArray {
        val url = "https://api.open-meteo.com/v1/forecast?latitude=$latitude&longitude=$longitude&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=${dates.size}"
        http.newCall(Request.Builder().url(url).build()).execute().use { response ->
            if (!response.isSuccessful) throw IllegalStateException("天气服务暂时不可用")
            val daily = JSONObject(response.body?.string().orEmpty()).optJSONObject("daily") ?: throw IllegalStateException("天气数据为空")
            val times = daily.getJSONArray("time")
            val codes = daily.getJSONArray("weather_code")
            val maxes = daily.getJSONArray("temperature_2m_max")
            val mins = daily.getJSONArray("temperature_2m_min")
            val rain = daily.optJSONArray("precipitation_probability_max")
            val fetchedAt = com.nana.levelup.logic.iso(Instant.now())
            val snapshots = JSONArray()
            for (index in 0 until times.length()) {
                val code = codes.optInt(index)
                snapshots.put(JSONObject()
                    .put("date", times.optString(index))
                    .put("latitude", latitude)
                    .put("longitude", longitude)
                    .put("locationName", name)
                    .put("weatherCode", code)
                    .put("summary", weatherSummary(code))
                    .put("temperatureMin", kotlin.math.round(mins.optDouble(index)).toInt())
                    .put("temperatureMax", kotlin.math.round(maxes.optDouble(index)).toInt())
                    .put("precipitationProbability", kotlin.math.round(rain?.optDouble(index) ?: 0.0).toInt())
                    .put("fetchedAt", fetchedAt))
            }
            return snapshots
        }
    }

    private fun cachedWeather(data: JSONObject, dates: List<String>): JSONArray {
        val allowed = dates.toSet()
        val cached = JSONArray()
        val briefs = data.optJSONArray("dailyBriefs") ?: return cached
        for (index in 0 until briefs.length()) {
            val weather = briefs.getJSONObject(index).optJSONObject("weather") ?: continue
            if (weather.optString("date") in allowed) cached.put(weather)
        }
        return cached
    }

    private fun weatherObject(weather: JSONArray, date: String): JSONObject? {
        for (index in 0 until weather.length()) {
            val item = weather.getJSONObject(index)
            if (item.optString("date") == date) return item
        }
        return null
    }

    private fun keepRecent(source: JSONArray?, cutoff: String, today: String): JSONArray {
        val kept = JSONArray()
        if (source == null) return kept
        for (index in 0 until source.length()) {
            val item = source.getJSONObject(index)
            val date = item.optString("date")
            if (date < today && date >= cutoff) kept.put(item)
        }
        return kept
    }
}

data class LocationFix(val latitude: Double, val longitude: Double, val name: String, val fromDevice: Boolean)

data class CompanionBatch(val messages: Map<String, String>, val source: String)
