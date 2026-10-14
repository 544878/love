package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

val automationTones = listOf("励志", "幽默", "安慰", "温柔")

fun stripMarkdown(value: String): String {
    return value
        .replace(Regex("```[\\s\\S]*?```")) { match -> match.value.replace(Regex("```[\\w-]*\\n?"), "") }
        .replace(Regex("!\\[([^\\]]*)\\]\\([^)]*\\)"), "$1")
        .replace(Regex("\\[([^\\]]+)\\]\\([^)]*\\)"), "$1")
        .replace(Regex("^#{1,6}\\s+", RegexOption.MULTILINE), "")
        .replace(Regex("^>\\s?", RegexOption.MULTILINE), "")
        .replace(Regex("[*_~`]"), "")
        .replace(Regex("^\\s*[-+]\\s+", RegexOption.MULTILINE), "· ")
        .replace(Regex("\\n{3,}"), "\n\n")
        .trim()
}

fun truncateText(value: String, maxLength: Int = 120): String {
    val clean = stripMarkdown(value).replace(Regex("\\s*\\n\\s*"), " ")
    return if (clean.length > maxLength) clean.substring(0, maxLength - 1) + "…" else clean
}

fun weatherSummary(code: Int): String {
    return when {
        code == 0 -> "晴朗"
        code <= 3 -> "多云"
        code <= 48 -> "有雾"
        code <= 57 -> "细雨"
        code <= 67 -> "有雨"
        code <= 77 -> "有雪"
        code <= 82 -> "阵雨"
        code <= 86 -> "阵雪"
        else -> "雷雨"
    }
}

fun nextAutomationDates(today: String = localDate(), count: Int = 7): List<String> {
    return List(count) { index -> shiftDate(today, index) }
}

fun fallbackCompanionMessage(date: String, tone: String, alias: String = "陶陶"): String {
    val messages = mapOf(
        "励志" to listOf(
            "今天不用一下子变得很厉害，认真完成眼前这一小步，就已经在靠近想去的地方。",
            "允许进度慢一点，但别把自己的认真看轻。你正在做的事，会悄悄长出结果。"
        ),
        "幽默" to listOf(
            "今日任务：先把最小的一件事做掉，然后理直气壮地奖励自己一口好吃的。",
            "脑子偶尔转圈很正常，先喝口水再继续，CPU 也需要温柔散热。"
        ),
        "安慰" to listOf(
            "如果今天有点累，就把标准调低一点。休息不是退步，是在替明天保存力气。",
            "没完成的事情不会定义你。先照顾好此刻的自己，剩下的我们慢慢来。"
        ),
        "温柔" to listOf(
            "今天也请好好吃饭、慢慢呼吸。你不需要表现得完美，也值得被认真喜欢。",
            "愿今天有一件很小的好事落在你身上，也愿你看见自己已经做得很好。"
        )
    )
    val pool = messages[tone] ?: messages.getValue("温柔")
    val index = parseLocalDate(date).dayOfMonth % pool.size
    return "${pool[index]} — $alias"
}

fun notificationId(value: String): Int {
    var hash = 0
    for (character in value) {
        hash = (hash shl 5) - hash + character.code
    }
    val absolute = if (hash == Int.MIN_VALUE) 0 else kotlin.math.abs(hash)
    val mod = absolute % 2_000_000_000
    return if (mod == 0) 1 else mod
}

fun parseMessageBatch(value: String, dates: List<String>): Map<String, String> {
    val clean = value.replace(Regex("^```(?:json)?\\s*", RegexOption.IGNORE_CASE), "").replace(Regex("\\s*```$"), "").trim()
    return try {
        val parsed = JSONArray(clean)
        buildMap {
            for (index in 0 until parsed.length()) {
                val item = parsed.optJSONObject(index) ?: continue
                val date = item.optString("date")
                val message = item.optString("message")
                if (date.isNotEmpty() && message.isNotEmpty()) put(date, truncateText(message, 150))
            }
        }
    } catch (_: Exception) {
        val lines = stripMarkdown(value).split("\n").map { it.replace(Regex("^\\d+[.)、]\\s*"), "").trim() }.filter { it.isNotEmpty() }
        dates.mapIndexed { index, date -> date to (lines.getOrNull(index) ?: "") }.toMap()
    }
}

fun ruleBody(rule: JSONObject, brief: JSONObject, settings: JSONObject): String {
    val kind = rule.optString("kind")
    if (kind == "weather" && brief.has("weather") && !brief.isNull("weather")) {
        val item = brief.getJSONObject("weather")
        val rain = if (item.optInt("precipitationProbability") >= 40) "，降水概率 ${item.optInt("precipitationProbability")}%，记得带伞" else ""
        return "${item.optString("locationName")}今天${item.optString("summary")}，${item.optInt("temperatureMin")}-${item.optInt("temperatureMax")}℃$rain。"
    }
    if (kind == "companion") return brief.optString("companionMessage")
    if (kind == "food") {
        val avoid = settings.optString("foodRecentDislikes").trim()
        val extra = if (avoid.isNotEmpty()) "，顺便避开最近不想吃的 $avoid" else ""
        return truncateText("到饭点啦。今天也要有主食、蛋白质和蔬果$extra。", 120)
    }
    if (kind == "study") return "今天实际完成了什么？写下一件就好。没有完成计划也没关系，记录真实进度比排满时间更重要。"
    return truncateText(rule.optString("prompt").ifEmpty { rule.optString("title") }, 120)
}

fun mergeAutomationRefresh(current: JSONObject, refreshed: JSONObject): JSONObject {
    val merged = JSONObject(current.toString())
    merged.put("dailyBriefs", refreshed.optJSONArray("dailyBriefs") ?: JSONArray())
    merged.put("automationRuns", refreshed.optJSONArray("automationRuns") ?: JSONArray())
    val settings = JSONObject((current.optJSONObject("settings") ?: JSONObject()).toString())
    val incoming = refreshed.optJSONObject("settings")
    if (incoming != null) {
        val keys = incoming.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            settings.put(key, incoming.get(key))
        }
    }
    merged.put("settings", settings)
    return merged
}

fun schoolSlots(): List<Pair<String, String>> {
    return List(12) { index ->
        val startMinutes = 8 * 60 + index * 50
        val endMinutes = startMinutes + 45
        fun format(minutes: Int) = "${(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}"
        format(startMinutes) to format(endMinutes)
    }
}

fun weekdayIndex(date: LocalDate): Int = jsDay(date)
