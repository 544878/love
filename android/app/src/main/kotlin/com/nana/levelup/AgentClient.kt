package com.nana.levelup

import com.nana.levelup.logic.agentSystemPrompt
import com.nana.levelup.logic.chunkText
import com.nana.levelup.logic.cosine
import com.nana.levelup.logic.fallbackAgentAnswer
import com.nana.levelup.logic.lexicalScore
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class AgentClient {
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    fun ask(settings: JSONObject, agent: String, input: String, imageText: String, knowledgeFiles: JSONArray, history: JSONArray): JSONObject {
        if (settings.optString("aiProvider") == "qwen") {
            val apiKey = settings.optString("qwenApiKey").trim()
            if (apiKey.isEmpty()) throw IllegalStateException("尚未配置千问 API Key")
            val base = settings.optString("qwenBaseUrl").ifEmpty { "https://dashscope.aliyuncs.com/compatible-mode/v1" }.trimEnd('/')
            val model = settings.optString("qwenChatModel").ifEmpty { "qwen-max" }
            val messages = JSONArray().put(JSONObject().put("role", "system").put("content", agentSystemPrompt(settings, agent)))
            historyMessages(history, settings.optInt("agentContextLimitChars", 800000)).forEach { messages.put(it) }
            messages.put(JSONObject().put("role", "user").put("content", listOf(input, imageText).filter { it.isNotBlank() }.joinToString("\n\n")))
            return readAnswer(post("$base/chat/completions", apiKey, JSONObject().put("model", model).put("messages", messages), "千问"))
        }
        val apiKey = settings.optString("deepSeekApiKey").trim()
        if (apiKey.isEmpty()) return JSONObject().put("text", fallbackAgentAnswer(settings, agent, input, imageText))
        val base = settings.optString("deepSeekBaseUrl").ifEmpty { "https://api.deepseek.com" }.trimEnd('/')
        val query = listOf(input, imageText).filter { it.isNotBlank() }.joinToString("\n").take(4000)
        val knowledge = retrieve(settings, knowledgeFiles, query, 8)
        val search = try { searchWeb(settings, query) } catch (_: Exception) { "" }
        val thinking = settings.optString("agentThinking") != "light"
        val temperature = (settings.optDouble("deepSeekTemperature", if (agent == "english") 0.45 else 0.58)).coerceIn(0.0, 1.5)
        val maxTokens = settings.optInt("deepSeekMaxOutputTokens", if (thinking) 65536 else 4096).coerceIn(2048, 384000)
        val messages = JSONArray().put(JSONObject().put("role", "system").put("content", agentSystemPrompt(settings, agent)))
        historyMessages(history, settings.optInt("agentContextLimitChars", 800000)).forEach { messages.put(it) }
        val user = listOf(
            knowledge.takeIf { it.isNotEmpty() }?.let { "本地文件库 RAG 命中片段：\n$it" },
            search.takeIf { it.isNotEmpty() }?.let { "Serper 联网搜索结果：\n$it" },
            imageText.takeIf { it.isNotEmpty() }?.let { "OCR/文件文本：\n$it" },
            input.takeIf { it.isNotEmpty() }?.let { "用户问题：\n$it" }
        ).filterNotNull().joinToString("\n\n")
        messages.put(JSONObject().put("role", "user").put("content", user))
        val body = JSONObject()
            .put("model", settings.optString("deepSeekModel").ifEmpty { "deepseek-v4-pro" })
            .put("thinking", JSONObject().put("type", if (thinking) "enabled" else "disabled"))
            .put("messages", messages)
            .put("max_tokens", maxTokens)
        if (thinking) body.put("reasoning_effort", if (settings.optString("agentThinking") == "deep") "max" else "high")
        else body.put("temperature", temperature)
        return readAnswer(post("$base/chat/completions", apiKey, body, "DeepSeek"))
    }

    fun deepSeekText(settings: JSONObject, system: String, user: String, maxTokens: Int = 1200): String {
        val apiKey = settings.optString("deepSeekApiKey").trim()
        if (apiKey.isEmpty()) throw IllegalStateException("尚未配置 DeepSeek API Key")
        val base = settings.optString("deepSeekBaseUrl").ifEmpty { "https://api.deepseek.com" }.trimEnd('/')
        val body = JSONObject()
            .put("model", settings.optString("deepSeekModel").ifEmpty { "deepseek-v4-pro" })
            .put("thinking", JSONObject().put("type", "enabled"))
            .put("reasoning_effort", "max")
            .put("messages", JSONArray()
                .put(JSONObject().put("role", "system").put("content", system))
                .put(JSONObject().put("role", "user").put("content", user)))
            .put("max_tokens", kotlin.math.max(maxTokens, 16384))
        return readContent(post("$base/chat/completions", apiKey, body, "DeepSeek"))
    }

    fun studySummary(settings: JSONObject, date: String, lines: List<String>): String {
        val apiKey = settings.optString("deepSeekApiKey").trim()
        if (apiKey.isEmpty()) throw IllegalStateException("尚未配置 DeepSeek API Key")
        val base = settings.optString("deepSeekBaseUrl").ifEmpty { "https://api.deepseek.com" }.trimEnd('/')
        val body = JSONObject()
            .put("model", settings.optString("deepSeekModel").ifEmpty { "deepseek-v4-pro" })
            .put("thinking", JSONObject().put("type", "disabled"))
            .put("temperature", 0.45)
            .put("messages", JSONArray()
                .put(JSONObject().put("role", "system").put("content", "你是温柔、克制的每日学习总结助手。只根据提供的学习记录总结，不补充生活、情绪、恋爱或不存在的内容。输出一段 55-110 个汉字的中文小结：先概括完成内容，再给一句具体而不过度鼓励的收尾。不要标题、列表、Markdown、明日计划或效率评价。"))
                .put(JSONObject().put("role", "user").put("content", "日期：$date\n学习记录：\n${lines.joinToString("\n") { "- $it" }}")))
            .put("max_tokens", 220)
        return readContent(post("$base/chat/completions", apiKey, body, "DeepSeek")).trim('"', '“', '”', ' ')
    }

    fun tts(settings: JSONObject, text: String): String {
        val apiKey = settings.optString("qwenApiKey").trim()
        if (apiKey.isEmpty()) throw IllegalStateException("尚未配置 Qwen API Key")
        val endpoint = settings.optString("qwenTtsEndpoint").ifEmpty { "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation" }
        val result = post(endpoint, apiKey, JSONObject()
            .put("model", settings.optString("qwenTtsModel").ifEmpty { "qwen3-tts-flash" })
            .put("input", JSONObject().put("text", text.take(1200)).put("voice", settings.optString("qwenTtsVoice").ifEmpty { "Cherry" })), "Qwen TTS")
        val output = result.optJSONObject("output")
        val url = output?.optJSONObject("audio")?.optString("url").orEmpty().ifEmpty {
            output?.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")?.optJSONObject("audio")?.optString("url").orEmpty()
        }
        if (url.isEmpty()) throw IllegalStateException("Qwen TTS 没有返回音频地址")
        return url
    }

    fun searchWeb(settings: JSONObject, query: String): String {
        val apiKey = settings.optString("serperApiKey").trim()
        if (apiKey.isEmpty() || !settings.optBoolean("agentWebSearch", true) || query.isBlank()) return ""
        val result = postRaw(
            settings.optString("serperEndpoint").ifEmpty { "https://google.serper.dev/search" },
            mapOf("Content-Type" to "application/json", "X-API-KEY" to apiKey),
            JSONObject().put("q", query).put("gl", "cn").put("hl", "zh-cn").put("num", 5),
            "Serper"
        )
        val blocks = mutableListOf<String>()
        result.optJSONObject("answerBox")?.let { box ->
            blocks += "直接答案：${box.optString("title")}\n${box.optString("answer").ifEmpty { box.optString("snippet") }}\n${box.optString("link")}".trim()
        }
        result.optJSONObject("knowledgeGraph")?.let { graph ->
            val attributes = graph.optJSONObject("attributes")
            val attributeText = attributes?.keys()?.asSequence()?.take(5)?.joinToString("\n") { key -> "$key: ${attributes.optString(key)}" }.orEmpty()
            blocks += "知识面板：${graph.optString("title")}\n${graph.optString("description")}${if (attributeText.isNotEmpty()) "\n$attributeText" else ""}".trim()
        }
        val organic = result.optJSONArray("organic") ?: JSONArray()
        for (index in 0 until minOf(6, organic.length())) {
            val item = organic.getJSONObject(index)
            blocks += "网页 ${index + 1}. ${item.optString("title").ifEmpty { "Untitled" }}\n${item.optString("snippet")}\n${item.optString("link")}"
        }
        val news = result.optJSONArray("news") ?: JSONArray()
        for (index in 0 until minOf(3, news.length())) {
            val item = news.getJSONObject(index)
            blocks += "新闻 ${index + 1}. ${item.optString("title").ifEmpty { "Untitled" }}\n${item.optString("source")} ${item.optString("date")}\n${item.optString("snippet")}\n${item.optString("link")}"
        }
        return blocks.filter { it.isNotBlank() }.joinToString("\n\n")
    }

    fun embedFile(settings: JSONObject, file: JSONObject): JSONObject {
        if (settings.optString("qwenApiKey").trim().isEmpty()) return file
        val chunks = file.optJSONArray("chunks") ?: return file
        if (chunks.length() == 0) return file
        val texts = JSONArray()
        for (index in 0 until chunks.length()) texts.put(chunks.getJSONObject(index).optString("text"))
        val embeddings = embedTexts(settings, texts)
        val nextChunks = JSONArray()
        for (index in 0 until chunks.length()) {
            val chunk = JSONObject(chunks.getJSONObject(index).toString())
            val vector = embeddings.optJSONArray(index)
            if (vector != null) chunk.put("embedding", vector)
            nextChunks.put(chunk)
        }
        return JSONObject(file.toString()).put("chunks", nextChunks)
    }

    private fun retrieve(settings: JSONObject, files: JSONArray, query: String, limit: Int): String {
        if (query.isBlank() || files.length() == 0) return ""
        data class Hit(val name: String, val text: String, val embedding: List<Double>?, var score: Double)
        val hits = mutableListOf<Hit>()
        for (fileIndex in 0 until files.length()) {
            val file = files.getJSONObject(fileIndex)
            val chunks = file.optJSONArray("chunks") ?: continue
            for (index in 0 until chunks.length()) {
                val chunk = chunks.getJSONObject(index)
                val embedding = chunk.optJSONArray("embedding")?.let { array ->
                    List(array.length()) { array.optDouble(it) }
                }
                hits += Hit(file.optString("name"), chunk.optString("text"), embedding, lexicalScore(query, chunk.optString("text")))
            }
        }
        if (hits.isEmpty()) return ""
        if (settings.optString("qwenApiKey").trim().isNotEmpty() && hits.any { !it.embedding.isNullOrEmpty() }) {
            try {
                val queryEmbedding = embedTexts(settings, JSONArray().put(query)).optJSONArray(0)
                if (queryEmbedding != null && queryEmbedding.length() > 0) {
                    val vector = List(queryEmbedding.length()) { queryEmbedding.optDouble(it) }
                    hits.forEach { hit ->
                        hit.score = if (!hit.embedding.isNullOrEmpty()) cosine(vector, hit.embedding) else lexicalScore(query, hit.text) * 0.2
                    }
                }
            } catch (_: Exception) {
                // Keep lexical scores.
            }
        }
        val ranked = hits.filter { it.score > 0 }.sortedByDescending { it.score }.take(limit)
        return ranked.mapIndexed { index, hit -> "[#${index + 1} ${hit.name}]\n${hit.text}" }.joinToString("\n\n---\n\n")
    }

    private fun embedTexts(settings: JSONObject, texts: JSONArray): JSONArray {
        val apiKey = settings.optString("qwenApiKey").trim()
        if (apiKey.isEmpty() || texts.length() == 0) return JSONArray()
        val base = settings.optString("qwenBaseUrl").ifEmpty { "https://dashscope.aliyuncs.com/compatible-mode/v1" }.trimEnd('/')
        val result = post("$base/embeddings", apiKey, JSONObject()
            .put("model", settings.optString("qwenEmbeddingModel").ifEmpty { "text-embedding-v4" })
            .put("input", texts)
            .put("dimensions", settings.optInt("qwenEmbeddingDimensions", 256)), "Qwen Embedding")
        val data = result.optJSONArray("data") ?: return JSONArray()
        val vectors = JSONArray()
        for (index in 0 until data.length()) vectors.put(data.getJSONObject(index).optJSONArray("embedding") ?: JSONArray())
        return vectors
    }

    private fun historyMessages(history: JSONArray, limitChars: Int): List<JSONObject> {
        val messages = mutableListOf<JSONObject>()
        var used = 0
        for (index in history.length() - 1 downTo 0) {
            val item = history.getJSONObject(index)
            val content = item.optString("text").take(120000)
            val reasoning = item.optString("reasoningContent").take(120000)
            val cost = content.length + reasoning.length
            if (used + cost > limitChars) break
            used += cost
            val message = JSONObject().put("role", item.optString("role")).put("content", content)
            if (item.optString("role") == "assistant" && reasoning.isNotEmpty()) message.put("reasoning_content", reasoning)
            messages.add(0, message)
        }
        return messages
    }

    private fun readAnswer(result: JSONObject): JSONObject {
        val choice = result.optJSONArray("choices")?.optJSONObject(0)
        val message = choice?.optJSONObject("message")
        val answer = JSONObject().put("text", readContent(result))
        val reasoning = message?.optString("reasoning_content").orEmpty()
        if (reasoning.isNotEmpty()) answer.put("reasoningContent", reasoning)
        return answer
    }

    private fun readContent(result: JSONObject): String {
        val choice = result.optJSONArray("choices")?.optJSONObject(0)
        val content = choice?.optJSONObject("message")?.optString("content")?.trim().orEmpty()
        if (content.isNotEmpty()) return content
        if (choice?.optString("finish_reason") == "length") throw IllegalStateException("DeepSeek 思考内容达到输出上限，未生成最终回答，请重试")
        throw IllegalStateException("DeepSeek 没有返回最终回答")
    }

    private fun post(url: String, apiKey: String, body: JSONObject, service: String): JSONObject {
        return postRaw(url, mapOf("Content-Type" to "application/json", "Authorization" to "Bearer $apiKey"), body, service)
    }

    private fun postRaw(url: String, headers: Map<String, String>, body: JSONObject, service: String): JSONObject {
        val builder = Request.Builder().url(url).post(body.toString().toRequestBody(jsonType))
        headers.forEach { (key, value) -> builder.header(key, value) }
        try {
            http.newCall(builder.build()).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val payload = if (text.startsWith("{")) JSONObject(text) else JSONObject()
                if (!response.isSuccessful) {
                    val detail = payload.optJSONObject("error")?.optString("message").orEmpty().ifEmpty { payload.optString("message") }
                    throw IllegalStateException("$service 调用失败（${response.code}）${if (detail.isNotEmpty()) "：$detail" else ""}")
                }
                return payload
            }
        } catch (error: IllegalStateException) {
            throw error
        } catch (_: Exception) {
            throw IllegalStateException("$service 网络请求失败，请检查网络")
        }
    }

    fun rechunk(content: String): JSONArray = chunkText(content.take(240000))
}
