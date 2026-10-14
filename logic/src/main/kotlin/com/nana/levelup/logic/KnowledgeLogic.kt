package com.nana.levelup.logic

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.min
import kotlin.math.sqrt

fun chunkText(text: String, maxLength: Int = 900, now: Instant = Instant.now()): JSONArray {
    val normalized = text.replace("\r\n", "\n").replace(Regex("\n{3,}"), "\n\n").trim()
    val chunks = JSONArray()
    if (normalized.isEmpty()) return chunks
    val paragraphs = normalized.split(Regex("\n\\s*\n"))
    val pieces = mutableListOf<String>()
    var current = ""
    for (paragraph in paragraphs) {
        val combined = listOf(current, paragraph).filter { it.isNotEmpty() }.joinToString("\n\n")
        if (combined.trim().length > maxLength && current.isNotEmpty()) {
            pieces += current.trim()
            current = paragraph
        } else {
            current = combined
        }
    }
    if (current.trim().isNotEmpty()) pieces += current.trim()
    for (piece in pieces) {
        if (piece.length <= maxLength * 1.35) {
            chunks.put(JSONObject().put("id", uid("chunk", now)).put("text", piece))
        } else {
            val count = ceil(piece.length / maxLength.toDouble()).toInt()
            for (index in 0 until count) {
                chunks.put(
                    JSONObject()
                        .put("id", uid("chunk", now))
                        .put("text", piece.substring(index * maxLength, min(piece.length, (index + 1) * maxLength)))
                )
            }
        }
    }
    return chunks
}

fun createKnowledgeFile(name: String, type: String, size: Long, content: String, now: Instant = Instant.now()): JSONObject {
    return JSONObject()
        .put("id", uid("file", now))
        .put("name", name)
        .put("type", type)
        .put("size", size)
        .put("uploadedAt", iso(now))
        .put("content", content)
        .put("chunks", chunkText(content, now = now))
}

fun cosine(left: List<Double>, right: List<Double>): Double {
    val length = min(left.size, right.size)
    var dot = 0.0
    var leftSquare = 0.0
    var rightSquare = 0.0
    for (index in 0 until length) {
        dot += left[index] * right[index]
        leftSquare += left[index] * left[index]
        rightSquare += right[index] * right[index]
    }
    return if (leftSquare != 0.0 && rightSquare != 0.0) dot / (sqrt(leftSquare) * sqrt(rightSquare)) else 0.0
}

fun lexicalScore(query: String, text: String): Double {
    val tokens = query.lowercase().split(Regex("[^\\p{L}\\p{N}]+")).filter { it.length > 1 }
    if (tokens.isEmpty()) return 0.0
    val haystack = text.lowercase()
    return tokens.count { haystack.contains(it) }.toDouble() / tokens.size
}

private val thinkingHints = mapOf(
    "light" to "先给结论，再给不超过三条关键理由，避免长篇推演。",
    "balanced" to "给出清晰结构、必要理由和可执行建议，保持适度深度。",
    "deep" to "允许更深入分析：先界定问题，再分层推理，补充背景、术语和反例。"
)

fun aiCapabilities(settings: JSONObject): String {
    val thinking = settings.optString("agentThinking").ifEmpty { "balanced" }
    val search = if (settings.optBoolean("agentWebSearch", true) && settings.optString("serperApiKey").trim().isNotEmpty()) {
        "已开启，将使用 Serper 搜索"
    } else {
        "关闭或未配置 Serper Key"
    }
    val upload = if (settings.optBoolean("agentFileUpload", true)) "用户已开启，当前可接收 OCR/文件摘要文本作为上下文" else "关闭"
    return "思考程度：$thinking\n联网搜索：$search\n上传文件：$upload"
}

fun agentSystemPrompt(settings: JSONObject, agent: String): String {
    val thinking = settings.optString("agentThinking").ifEmpty { "balanced" }
    val base = listOf(
        "学生：${settings.optString("ownerName")}",
        "陪伴者：${settings.optString("partnerName").ifEmpty { "程韵陶" }}，昵称：${settings.optString("companionAlias").ifEmpty { "陶陶" }}",
        "目标：${settings.optString("targetSchool")}${settings.optString("targetMajor")}",
        thinkingHints[thinking] ?: thinkingHints.getValue("balanced"),
        aiCapabilities(settings),
        "请输出兼容 react-markdown 的 Markdown：使用普通标题、列表、粗体和表格；不要输出 HTML；数学内容用标准 LaTeX。"
    ).joinToString("\n")
    val specific = when (agent) {
        "food" -> listOf(
            "你是耐心、清晰的法语老师，适合中文母语初学者。",
            "重点能力：发音提示、基础语法、常用词汇、情景对话、逐句纠错。",
            "回答结构优先：核心知识 -> 中文解释 -> 法语例句 -> 发音/易错点 -> 一个小练习。"
        )
        "planner" -> listOf(
            "你是温柔、务实的生活助手，帮助整理待办、学习节奏、情绪和日常安排。",
            "不要把时间排满，不制造效率焦虑。先确认最重要的一件事，再给出可执行的小步骤与休息空间。",
            "涉及健康、法律或财务时明确提醒寻求专业帮助，不做诊断。"
        )
        else -> listOf(
            "你是专业的英美文学与英语阅读导师。语气应稳、准、专业，可以使用文学术语，但每个术语都要让学生能理解。",
            "重点能力：细读 close reading、叙事视角、意象、修辞、主题、时代语境、翻译与长难句拆解。",
            "回答结构优先：文本要点 -> 语言/句法 -> 文学解读 -> 可迁移阅读方法 -> 练习。"
        )
    }
    return (listOf(base) + specific).joinToString("\n")
}

fun fallbackAgentAnswer(settings: JSONObject, agent: String, input: String, imageText: String = ""): String {
    if (agent == "food") {
        return listOf(
            "### 法语小课堂",
            "",
            "- Bonjour：你好，常用于白天见面。",
            "- Je m'appelle Ru：我叫洳。",
            "- 小练习：用 `Je m'appelle ...` 做一次自我介绍。"
        ).joinToString("\n")
    }
    if (agent == "planner") {
        return listOf(
            "### 先把今天理顺",
            "",
            "- 先选最重要的一件事。",
            "- 把它缩小成 20-30 分钟能开始的步骤。",
            "- 完成后休息，再决定要不要继续。",
            "- 没完成也记录真实原因，不用责怪自己。"
        ).joinToString("\n")
    }
    val material = if (imageText.isNotEmpty()) "\n\n### OCR 文本\n$imageText" else ""
    return listOfNotNull(
        "### 本地版英语导师提示",
        "",
        "还没有配置 DeepSeek Key，所以先给你一个可执行的阅读框架：",
        "",
        "1. 先圈出关键词、反复出现的意象和情绪转折。",
        "2. 再拆句法：主句、从句、插入语、修饰成分分别承担什么功能。",
        "3. 如果是文学文本，重点看叙事视角、象征、语气、时代背景和人物关系。",
        "4. 最后用自己的话复述主旨，并整理 2 个可迁移表达。",
        if (input.isNotEmpty()) "\n你的问题：$input" else null,
        material.ifEmpty { null }
    ).joinToString("\n")
}

fun settingsString(settings: JSONObject, key: String, default: String): String {
    val value = settings.optString(key)
    return value.ifEmpty { default }
}
