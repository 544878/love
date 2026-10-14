package com.nana.levelup

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.nana.levelup.logic.buildBadges
import com.nana.levelup.logic.calculateStreak
import com.nana.levelup.logic.createKnowledgeFile
import com.nana.levelup.logic.formatDuration
import com.nana.levelup.logic.iso
import com.nana.levelup.logic.localDate
import com.nana.levelup.logic.monthCells
import com.nana.levelup.logic.parseLocalDate
import com.nana.levelup.logic.schoolSlots
import com.nana.levelup.logic.shiftDate
import com.nana.levelup.logic.totalStudySeconds
import com.nana.levelup.logic.uid
import com.nana.levelup.logic.weeklyCompletion
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.time.LocalDate

@Composable
fun CoachScreen(model: AppModel, data: JSONObject) {
    val settings = data.getJSONObject("settings")
    val ui = data.optJSONObject("agentUiState") ?: JSONObject()
    val agent = ui.optString("agent").ifEmpty { "english" }
    var question by remember(agent) { mutableStateOf(ui.optString("questionDraft")) }
    var asking by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        if (!settings.optBoolean("agentFileUpload", true)) {
            model.notify("请先在设置里开启 Agent 上传文件能力")
            return@rememberLauncherForActivityResult
        }
        val type = context.contentResolver.getType(uri).orEmpty()
        if (type.startsWith("image/")) {
            model.notify("识图已移除，请改用 txt、md、csv 或 json 文件")
            return@rememberLauncherForActivityResult
        }
        val text = readText(context, uri).take(160000)
        val name = uri.lastPathSegment ?: "笔记.txt"
        CoroutineScope(Dispatchers.IO).launch {
            val file = createKnowledgeFile(name, type.ifEmpty { "text/plain" }, text.length.toLong(), text)
            val enriched = try { model.agents.embedFile(settings, file) } catch (_: Exception) { file }
            withContext(Dispatchers.Main) {
                model.edit { current ->
                    val files = JSONArray().put(enriched)
                    current.array("knowledgeFiles").objects().forEach { files.put(it) }
                    current.put("knowledgeFiles", files)
                }
                model.notify(if (settings.optString("qwenApiKey").isNotBlank()) "文件已存入本地知识库，并尝试建立 Qwen 向量索引" else "文件已存入本地知识库，将使用关键词检索")
            }
        }
    }
    val conversations = data.array("agentConversations").objects().filter { it.optString("agent") == agent }.sortedByDescending { it.optString("updatedAt") }
    val active = conversations.firstOrNull { it.optString("id") == ui.optString("activeConversationId") } ?: conversations.firstOrNull()
    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text(when (agent) { "food" -> "法语老师"; "planner" -> "生活助手"; else -> "英语导师" }, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        androidx.compose.foundation.layout.Row {
            listOf("english" to "英语", "food" to "法语", "planner" to "生活").forEach { (id, label) ->
                FilterChip(selected = agent == id, onClick = { model.edit(sync = false) { it.put("agentUiState", JSONObject(ui.toString()).put("agent", id)) } }, label = { Text(label) }, modifier = Modifier.padding(end = 6.dp))
            }
        }
        TextButton(onClick = { picker.launch("text/*") }) { Text("加入知识库") }
        data.array("knowledgeFiles").objects().forEach { file ->
            Text("${file.optString("name")} · ${file.array("chunks").length()} 段", modifier = Modifier.padding(vertical = 4.dp))
            TextButton(onClick = { model.edit { current -> current.put("knowledgeFiles", JSONArray().apply { current.array("knowledgeFiles").objects().filter { it.optString("id") != file.optString("id") }.forEach { put(it) } }) }; model.notify("已从本地知识库移除") }) { Text("移除") }
        }
        val messages = active?.array("messages")?.objects().orEmpty()
        if (messages.isEmpty()) Text(if (agent == "english") "可以上传英文文本或直接提问。识图功能已经移除。" else "直接写下今天的问题。")
        messages.forEach { message ->
            Text(message.optString("text"), modifier = Modifier.padding(vertical = 6.dp))
        }
        if (settings.optBoolean("voiceOutput", true)) {
            TextButton(onClick = {
                val text = messages.lastOrNull { it.optString("role") == "assistant" }?.optString("text").orEmpty()
                if (text.isBlank() || settings.optString("qwenApiKey").isBlank()) return@TextButton
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        val url = model.agents.tts(settings, text.replace(Regex("[#*_`>\\-|]"), "").take(900))
                        withContext(Dispatchers.Main) { context.startActivity(Intent(Intent.ACTION_VIEW).setData(android.net.Uri.parse(url))) }
                    } catch (error: Exception) {
                        withContext(Dispatchers.Main) { model.notify(error.message ?: "暂时不能朗读") }
                    }
                }
            }) { Text("朗读") }
        }
        OutlinedTextField(question, { question = it }, modifier = Modifier.fillMaxWidth(), label = { Text("想问什么") })
        Button(onClick = {
            if (asking || question.isBlank()) return@Button
            asking = true
            val history = active?.array("messages") ?: JSONArray()
            val asked = question.trim()
            CoroutineScope(Dispatchers.IO).launch {
                val answer = try {
                    model.agents.ask(settings, agent, asked, ui.optString("imageTextDraft"), data.array("knowledgeFiles"), history)
                } catch (error: Exception) {
                    JSONObject().put("text", error.message ?: "助手暂时没有回应")
                }
                withContext(Dispatchers.Main) {
                    model.edit { current ->
                        val at = iso(Instant.now())
                        val userMessage = JSONObject().put("id", uid("agent-msg")).put("role", "user").put("agent", agent).put("text", asked).put("createdAt", at)
                        val assistant = JSONObject().put("id", uid("agent-msg")).put("role", "assistant").put("agent", agent).put("text", answer.optString("text")).put("createdAt", iso(Instant.now()))
                        if (answer.has("reasoningContent")) assistant.put("reasoningContent", answer.optString("reasoningContent"))
                        val conversation = if (active == null) {
                            JSONObject().put("id", uid("agent-chat")).put("date", localDate()).put("title", asked.take(24)).put("agent", agent).put("messages", JSONArray().put(userMessage).put(assistant)).put("createdAt", at).put("updatedAt", at)
                        } else {
                            val nextMessages = JSONArray()
                            active.array("messages").objects().forEach { nextMessages.put(it) }
                            nextMessages.put(userMessage).put(assistant)
                            JSONObject(active.toString()).put("messages", nextMessages).put("updatedAt", at)
                        }
                        val all = JSONArray().put(conversation)
                        current.array("agentConversations").objects().filter { it.optString("id") != conversation.optString("id") }.forEach { all.put(it) }
                        current.put("agentConversations", all)
                        current.put("agentUiState", JSONObject(ui.toString()).put("agent", agent).put("questionDraft", "").put("activeConversationId", conversation.optString("id")).put("chatDate", localDate()))
                    }
                    question = ""
                    asking = false
                }
            }
        }, enabled = !asking) { Text(if (asking) "正在回答" else "发送") }
    }
}

@Composable
fun CoupleScreen(model: AppModel, data: JSONObject) {
    val settings = data.getJSONObject("settings")
    val author = if (model.profile() == "ru") settings.string("ownerName", "娜娜") else settings.string("partnerName", "陶陶")
    var chat by remember { mutableStateOf("") }
    var craving by remember { mutableStateOf("") }
    var courseTitle by remember { mutableStateOf("") }
    PageColumn("互动") {
        TextButton(onClick = { model.open("chat") }) { Text("打开聊天") }
        TextButton(onClick = { model.open("moments") }) { Text("打开朋友圈") }
        OutlinedTextField(chat, { chat = it }, modifier = Modifier.fillMaxWidth(), label = { Text("留一句话") })
        Button(onClick = {
            if (chat.isBlank()) return@Button
            model.edit { current ->
                val messages = JSONArray()
                current.array("coupleMessages").objects().forEach { messages.put(it) }
                messages.put(JSONObject().put("id", uid("chat")).put("author", author).put("text", chat.trim()).put("type", "text").put("status", if (current.optJSONObject("syncState")?.optBoolean("enabled") == true) "sending" else "synced").put("createdAt", iso(Instant.now())))
                current.put("coupleMessages", messages)
            }
            chat = ""
        }) { Text("发送") }
        OutlinedTextField(craving, { craving = it }, modifier = Modifier.fillMaxWidth(), label = { Text("想被投喂什么") })
        Button(onClick = {
            if (craving.isBlank()) return@Button
            val at = iso(Instant.now())
            model.edit { current ->
                val wishes = JSONArray().put(JSONObject().put("id", uid("feed")).put("author", author).put("craving", craving.trim()).put("note", "").put("priority", "want").put("date", localDate()).put("fulfilled", false).put("status", "requested").put("createdAt", at).put("updatedAt", at))
                current.array("feedWishes").objects().forEach { wishes.put(it) }
                current.put("feedWishes", wishes)
            }
            craving = ""
        }) { Text("记下投喂") }
        data.array("feedWishes").objects().take(8).forEach { wish ->
            Text("${wish.optString("craving")} · ${wish.optString("status").ifEmpty { "requested" }}", modifier = Modifier.padding(vertical = 4.dp))
            TextButton(onClick = {
                model.edit { current ->
                    val wishes = JSONArray()
                    current.array("feedWishes").objects().forEach { item ->
                        if (item.optString("id") != wish.optString("id")) wishes.put(item) else {
                            val status = when (item.optString("status")) { "accepted" -> "delivered"; "delivered" -> "requested"; else -> "accepted" }
                            wishes.put(JSONObject(item.toString()).put("status", status).put("fulfilled", status == "delivered").put("updatedAt", iso(Instant.now())))
                        }
                    }
                    current.put("feedWishes", wishes)
                }
            }) { Text("推进状态") }
        }
        OutlinedTextField(courseTitle, { courseTitle = it }, modifier = Modifier.fillMaxWidth(), label = { Text("本周课程") })
        Button(onClick = {
            if (courseTitle.isBlank()) return@Button
            val slot = schoolSlots().first()
            model.edit { current ->
                val courses = JSONArray()
                current.array("sharedCourses").objects().forEach { courses.put(it) }
                courses.put(JSONObject().put("id", uid("course")).put("title", courseTitle.trim()).put("weekday", LocalDate.now().dayOfWeek.value % 7).put("startTime", slot.first).put("endTime", slot.second).put("location", "").put("note", "").put("color", if (model.profile() == "ru") "#ef9c83" else "#7ca7a1").put("owner", model.profile()).put("weekStart", weekStart()).put("slotIndex", 0).put("createdAt", iso(Instant.now())))
                current.put("sharedCourses", courses)
            }
            courseTitle = ""
        }) { Text("加入课表") }
        data.array("sharedCourses").objects().filter { it.optString("weekStart") == weekStart() || it.optString("weekStart").isEmpty() }.forEach { course ->
            Text("${course.optString("title")} ${course.optString("startTime")}-${course.optString("endTime")}")
        }
    }
}

@Composable
fun ChatScreen(model: AppModel, data: JSONObject) {
    val settings = data.getJSONObject("settings")
    val author = if (model.profile() == "ru") settings.string("ownerName", "娜娜") else settings.string("partnerName", "陶陶")
    var text by remember { mutableStateOf("") }
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val dataUrl = compressImage(readBytes(context, uri))
        if (dataUrl.isEmpty()) { model.notify("图片发送失败，请换一张再试"); return@rememberLauncherForActivityResult }
        val photoId = uid("chat-photo")
        model.savePhoto(photoId, dataUrl)
        model.edit { current ->
            val messages = JSONArray()
            current.array("coupleMessages").objects().forEach { messages.put(it) }
            messages.put(JSONObject().put("id", uid("chat")).put("author", author).put("text", "图片").put("type", "image").put("photoId", photoId).put("status", if (current.optJSONObject("syncState")?.optBoolean("enabled") == true) "sending" else "synced").put("createdAt", iso(Instant.now())))
            current.put("coupleMessages", messages)
        }
    }
    PageColumn("聊天") {
        TextButton(onClick = { model.open("couple") }) { Text("返回互动") }
        data.array("coupleMessages").objects().forEach { message ->
            Text("${message.optString("author")}：${message.optString("text")} ${message.optString("status")}")
            if (message.optString("status") == "failed") {
                TextButton(onClick = { model.edit { current -> current.put("coupleMessages", JSONArray().apply { current.array("coupleMessages").objects().forEach { item -> put(if (item.optString("id") == message.optString("id")) JSONObject(item.toString()).put("status", "sending") else item) } }) } }) { Text("重试") }
            }
        }
        OutlinedTextField(text, { text = it }, modifier = Modifier.fillMaxWidth(), label = { Text("消息") })
        Button(onClick = {
            if (text.isBlank()) return@Button
            val body = text.trim()
            model.edit { current ->
                val messages = JSONArray()
                current.array("coupleMessages").objects().forEach { messages.put(it) }
                messages.put(JSONObject().put("id", uid("chat")).put("author", author).put("text", body).put("type", "text").put("status", if (current.optJSONObject("syncState")?.optBoolean("enabled") == true) "sending" else "synced").put("createdAt", iso(Instant.now())))
                current.put("coupleMessages", messages)
            }
            text = ""
        }) { Text("发送") }
        TextButton(onClick = { picker.launch("image/*") }) { Text("发送图片") }
    }
}

@Composable
fun MomentsScreen(model: AppModel, data: JSONObject) {
    val settings = data.getJSONObject("settings")
    val profile = model.profile()
    val author = if (profile == "ru") settings.string("ownerName", "娜娜") else settings.string("partnerName", "陶陶")
    var text by remember { mutableStateOf("") }
    var comment by remember { mutableStateOf("") }
    PageColumn("朋友圈") {
        TextButton(onClick = { model.open("couple") }) { Text("返回互动") }
        OutlinedTextField(text, { text = it }, modifier = Modifier.fillMaxWidth(), label = { Text("这一刻") })
        Button(onClick = {
            if (text.isBlank()) return@Button
            val at = iso(Instant.now())
            model.edit { current ->
                val posts = JSONArray().put(JSONObject().put("id", uid("couple-post")).put("author", author).put("authorProfile", profile).put("text", text.trim()).put("photoIds", JSONArray()).put("likes", JSONArray()).put("comments", JSONArray()).put("date", localDate()).put("createdAt", at))
                current.array("couplePosts").objects().forEach { posts.put(it) }
                current.put("couplePosts", posts)
            }
            text = ""
        }) { Text("发布") }
        data.array("couplePosts").objects().forEach { post ->
            Text("${post.optString("author")}：${post.optString("text")}", modifier = Modifier.padding(top = 8.dp))
            val liked = (0 until post.array("likes").length()).any { post.array("likes").optString(it) == profile }
            TextButton(onClick = {
                model.edit { current ->
                    val posts = JSONArray()
                    current.array("couplePosts").objects().forEach { item ->
                        if (item.optString("id") != post.optString("id")) posts.put(item) else {
                            val likes = (0 until item.array("likes").length()).map { item.array("likes").optString(it) }.filter { it != profile }.toMutableList()
                            if (!liked) likes += profile
                            posts.put(JSONObject(item.toString()).put("likes", JSONArray(likes)))
                        }
                    }
                    current.put("couplePosts", posts)
                }
            }) { Text(if (liked) "取消赞" else "赞") }
            post.array("comments").objects().forEach { item -> Text("${item.optString("author")}：${item.optString("text")}") }
            OutlinedTextField(comment, { comment = it }, label = { Text("评论 ${post.optString("id").take(4)}") })
            TextButton(onClick = {
                if (comment.isBlank()) return@TextButton
                model.edit { current ->
                    val posts = JSONArray()
                    current.array("couplePosts").objects().forEach { item ->
                        if (item.optString("id") != post.optString("id")) posts.put(item) else {
                            val comments = JSONArray()
                            item.array("comments").objects().forEach { comments.put(it) }
                            comments.put(JSONObject().put("id", uid("comment")).put("authorProfile", profile).put("author", author).put("text", comment.trim()).put("createdAt", iso(Instant.now())))
                            posts.put(JSONObject(item.toString()).put("comments", comments))
                        }
                    }
                    current.put("couplePosts", posts)
                }
                comment = ""
            }) { Text("评论") }
        }
    }
}

@Composable
fun CalendarScreen(model: AppModel, data: JSONObject) {
    var cursor by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1)) }
    var selected by remember { mutableStateOf(localDate()) }
    var title by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    val cells = monthCells(cursor.year, cursor.monthValue - 1)
    val author = if (model.profile() == "ru") data.getJSONObject("settings").string("ownerName", "娜娜") else data.getJSONObject("settings").string("partnerName", "陶陶")
    PageColumn("公共日历") {
        androidx.compose.foundation.layout.Row {
            TextButton(onClick = { cursor = cursor.minusMonths(1) }) { Text("上月") }
            Text("${cursor.year} ${cursor.monthValue} 月", modifier = Modifier.padding(8.dp))
            TextButton(onClick = { cursor = cursor.plusMonths(1) }) { Text("下月") }
        }
        cells.forEach { date ->
            if (date != null) TextButton(onClick = { selected = date }) { Text(if (date == selected) "[${parseLocalDate(date).dayOfMonth}]" else parseLocalDate(date).dayOfMonth.toString()) }
        }
        Text(selected)
        OutlinedTextField(title, { title = it }, modifier = Modifier.fillMaxWidth(), label = { Text("这一天的事") })
        OutlinedTextField(note, { note = it }, modifier = Modifier.fillMaxWidth(), label = { Text("备注") })
        Button(onClick = {
            if (title.isBlank()) return@Button
            val at = iso(Instant.now())
            model.edit { current ->
                val events = JSONArray().put(JSONObject().put("id", uid("event")).put("kind", "custom").put("title", title.trim()).put("date", selected).put("note", note.trim()).put("author", author).put("createdAt", at).put("updatedAt", at))
                current.array("coupleEvents").objects().forEach { events.put(it) }
                current.put("coupleEvents", events)
            }
            title = ""; note = ""
        }) { Text("保存事项") }
        data.array("coupleEvents").objects().filter { it.optString("date") == selected }.forEach { event ->
            Text("${event.optString("title")} ${event.optString("note")}")
            var memory by remember(event.optString("id")) { mutableStateOf(event.optString("memoryText")) }
            OutlinedTextField(memory, { memory = it }, label = { Text("共同回忆") })
            TextButton(onClick = {
                model.edit { current ->
                    val events = JSONArray()
                    current.array("coupleEvents").objects().forEach { item ->
                        events.put(if (item.optString("id") == event.optString("id")) JSONObject(item.toString()).put("memoryText", memory.trim()).put("memoryUpdatedAt", iso(Instant.now())).put("updatedAt", iso(Instant.now())) else item)
                    }
                    current.put("coupleEvents", events)
                }
            }) { Text("保存回忆") }
        }
    }
}

@Composable
fun GrowthScreen(model: AppModel, data: JSONObject) {
    val badges = buildBadges(data, model.now).objects()
    val weekly = weeklyCompletion(data, localDate())
    val streak = calculateStreak(data.array("checkIns"), data.array("reports"))
    var gift by remember { mutableStateOf("") }
    PageColumn("看见自己的成长") {
        Text("本周完成 $weekly%")
        Text("连续 $streak 天 · 累计 ${totalStudySeconds(data, model.now) / 60} 分钟")
        OutlinedTextField(gift, { gift = it }, modifier = Modifier.fillMaxWidth(), label = { Text("送给对方的勋章") })
        Button(onClick = {
            if (gift.isBlank()) return@Button
            val at = iso(Instant.now())
            val profile = model.profile()
            model.edit { current ->
                val gifts = JSONArray().put(JSONObject().put("id", uid("badge-gift")).put("giver", profile).put("receiver", if (profile == "ru") "taotao" else "ru").put("name", gift.trim()).put("description", "").put("target", 1).put("progress", 0).put("gift", "").put("completed", false).put("claimed", false).put("createdAt", at).put("updatedAt", at))
                current.array("customBadgeGifts").objects().forEach { gifts.put(it) }
                current.put("customBadgeGifts", gifts)
            }
            gift = ""
        }) { Text("送出") }
        data.array("customBadgeGifts").objects().forEach { item ->
            Text("${item.optString("name")} ${if (item.optBoolean("claimed")) "已领取" else if (item.optBoolean("completed")) "待领取" else "进行中"}")
            if (item.optString("receiver") == model.profile() && !item.optBoolean("completed")) {
                TextButton(onClick = { model.edit { current -> current.put("customBadgeGifts", JSONArray().apply { current.array("customBadgeGifts").objects().forEach { giftItem -> put(if (giftItem.optString("id") == item.optString("id")) JSONObject(giftItem.toString()).put("progress", giftItem.opt("target")).put("completed", true).put("updatedAt", iso(Instant.now())) else giftItem) } }) } }) { Text("标记完成") }
            }
            if (item.optString("receiver") == model.profile() && item.optBoolean("completed") && !item.optBoolean("claimed")) {
                TextButton(onClick = { model.edit { current -> current.put("customBadgeGifts", JSONArray().apply { current.array("customBadgeGifts").objects().forEach { giftItem -> put(if (giftItem.optString("id") == item.optString("id")) JSONObject(giftItem.toString()).put("claimed", true).put("updatedAt", iso(Instant.now())) else giftItem) } }) } }) { Text("领取礼物") }
            }
        }
        badges.forEach { badge -> Text("${badge.optString("name")} ${badge.optLong("progress")}/${badge.optLong("target")} ${if (badge.optBoolean("unlocked")) "已点亮" else ""}") }
        data.array("studySessions").objects().take(5).forEach { session -> Text("${session.optString("date")} ${session.optString("title")} ${formatDuration(session.optLong("durationSeconds"))}") }
    }
}

@Composable
fun AutomationScreen(model: AppModel, data: JSONObject) {
    PageColumn("今日提醒") {
        TextButton(onClick = { model.open("today") }) { Text("返回今日") }
        Button(onClick = { model.refreshAutomations(true) }, enabled = !model.refreshing) { Text(if (model.refreshing) "刷新中" else "刷新今天") }
        data.array("automations").objects().forEach { rule ->
            Text("${rule.optString("time")} ${rule.optString("title")} ${if (rule.optBoolean("enabled")) "开" else "关"}")
            TextButton(onClick = {
                model.edit { current ->
                    val rules = JSONArray()
                    current.array("automations").objects().forEach { item ->
                        rules.put(if (item.optString("id") == rule.optString("id")) JSONObject(item.toString()).put("enabled", !item.optBoolean("enabled")) else item)
                    }
                    current.put("automations", rules)
                }
            }) { Text("开关") }
        }
        data.array("dailyBriefs").objects().firstOrNull { it.optString("date") == localDate() }?.let { brief ->
            Text(brief.optString("companionMessage"))
            brief.optJSONObject("weather")?.let { weather -> Text("${weather.optString("summary")} ${weather.optInt("temperatureMin")}-${weather.optInt("temperatureMax")}℃") }
        }
        data.array("automationRuns").objects().filter { it.optString("date") == localDate() }.forEach { run -> Text(run.optString("body")) }
    }
}

@Composable
fun SettingsScreen(model: AppModel, data: JSONObject) {
    val settings = data.getJSONObject("settings")
    val context = LocalContext.current
    var owner by remember(settings.optString("ownerName")) { mutableStateOf(settings.optString("ownerName")) }
    var partner by remember(settings.optString("partnerName")) { mutableStateOf(settings.optString("partnerName")) }
    var school by remember(settings.optString("targetSchool")) { mutableStateOf(settings.optString("targetSchool")) }
    var major by remember(settings.optString("targetMajor")) { mutableStateOf(settings.optString("targetMajor")) }
    var city by remember(settings.optString("weatherFallbackCity")) { mutableStateOf(settings.optString("weatherFallbackCity")) }
    var deepseek by remember { mutableStateOf(settings.optString("deepSeekApiKey")) }
    var qwen by remember { mutableStateOf(settings.optString("qwenApiKey")) }
    var serper by remember { mutableStateOf(settings.optString("serperApiKey")) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var space by remember { mutableStateOf(settings.optJSONObject("sync")?.optString("spaceId") ?: data.optJSONObject("syncState")?.optString("spaceId").orEmpty()) }
    var invite by remember { mutableStateOf("") }
    var habitName by remember { mutableStateOf("") }
    var confirmClear by remember { mutableStateOf(false) }
    val exportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        context.contentResolver.openOutputStream(uri)?.use { it.write(model.repository.createBackup(data).toString(2).toByteArray()) }
        model.notify("备份已经保存")
    }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        try { model.restore(JSONObject(readText(context, uri))) } catch (_: Exception) { model.notify("备份恢复失败") }
    }
    PageColumn("设置") {
        Text("当前：${if (model.profile() == "ru") "洳的空间" else "陶陶的空间"}")
        TextButton(onClick = { model.edit(sync = false) { it.getJSONObject("settings").put("activeProfile", if (model.profile() == "ru") "taotao" else "ru") } }) { Text("切换使用者") }
        listOf("rose" to "玫瑰", "peach" to "蜜桃", "sage" to "鼠尾草").forEach { (id, label) ->
            FilterChip(selected = settings.optString("theme") == id, onClick = { model.edit(sync = false) { it.getJSONObject("settings").put("theme", id) } }, label = { Text(label) })
        }
        OutlinedTextField(owner, { owner = it }, modifier = Modifier.fillMaxWidth(), label = { Text("洳的名字") })
        OutlinedTextField(partner, { partner = it }, modifier = Modifier.fillMaxWidth(), label = { Text("陶陶的名字") })
        OutlinedTextField(school, { school = it }, modifier = Modifier.fillMaxWidth(), label = { Text("目标学校") })
        OutlinedTextField(major, { major = it }, modifier = Modifier.fillMaxWidth(), label = { Text("目标方向") })
        OutlinedTextField(city, { city = it }, modifier = Modifier.fillMaxWidth(), label = { Text("天气备用城市") })
        Button(onClick = {
            model.edit(sync = false) { current ->
                current.getJSONObject("settings")
                    .put("ownerName", owner.trim())
                    .put("partnerName", partner.trim())
                    .put("targetSchool", school.trim())
                    .put("targetMajor", major.trim())
                    .put("weatherFallbackCity", city.trim())
            }
            model.notify("资料已保存")
        }) { Text("保存资料") }
        OutlinedTextField(deepseek, { deepseek = it }, modifier = Modifier.fillMaxWidth(), label = { Text("DeepSeek API Key") })
        OutlinedTextField(qwen, { qwen = it }, modifier = Modifier.fillMaxWidth(), label = { Text("千问 API Key") })
        OutlinedTextField(serper, { serper = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Serper API Key") })
        Button(onClick = {
            model.edit(sync = false) { current ->
                current.getJSONObject("settings").put("deepSeekApiKey", deepseek.trim()).put("qwenApiKey", qwen.trim()).put("serperApiKey", serper.trim())
            }
            model.notify("密钥只保存在这台设备")
        }) { Text("保存密钥") }
        Text("云同步 ${data.optJSONObject("syncState")?.optString("status") ?: "signed-out"} ${if (model.cloud.configured()) "" else "未配置"}")
        Text(data.optJSONObject("syncState")?.optString("currentUser").orEmpty())
        if (data.optJSONObject("syncState")?.optString("inviteCode").orEmpty().isNotEmpty()) Text("邀请码：${data.optJSONObject("syncState")?.optString("inviteCode")}")
        if (data.optJSONObject("syncState")?.optString("currentUser").isNullOrEmpty()) {
            OutlinedTextField(username, { username = it }, modifier = Modifier.fillMaxWidth(), label = { Text("用户名") })
            OutlinedTextField(password, { password = it }, modifier = Modifier.fillMaxWidth(), label = { Text("密码") })
            OutlinedTextField(space, { space = it }, modifier = Modifier.fillMaxWidth(), label = { Text("共享空间 ID") })
            OutlinedTextField(invite, { invite = it }, modifier = Modifier.fillMaxWidth(), label = { Text("邀请码（加入时填写）") })
            Button(onClick = { model.login(username, password, space, invite.ifBlank { null }); password = "" }, enabled = !model.busy) { Text("登录") }
        } else {
            TextButton(onClick = { model.pushCloud() }) { Text("上传本机") }
            TextButton(onClick = { model.pullCloud() }) { Text("拉取云端") }
            TextButton(onClick = { model.logout() }) { Text("退出") }
        }
        OutlinedTextField(habitName, { habitName = it }, modifier = Modifier.fillMaxWidth(), label = { Text("新习惯") })
        Button(onClick = {
            if (habitName.isBlank()) return@Button
            model.edit { current ->
                val habits = JSONArray()
                current.array("habits").objects().forEach { habits.put(it) }
                habits.put(JSONObject().put("id", uid("habit")).put("name", habitName.trim()).put("icon", "study").put("color", "#d9828d").put("unit", "分钟").put("target", 30).put("days", JSONArray(listOf(0, 1, 2, 3, 4, 5, 6))).put("createdAt", iso(Instant.now())))
                current.put("habits", habits)
            }
            habitName = ""
        }) { Text("添加习惯") }
        data.array("habits").objects().forEach { habit ->
            Text(habit.optString("name"))
            TextButton(onClick = { model.edit { current -> current.put("habits", JSONArray().apply { current.array("habits").objects().filter { it.optString("id") != habit.optString("id") }.forEach { put(it) } }) } }) { Text("删除") }
        }
        TextButton(onClick = { exportLauncher.launch("成长手账备份-${localDate()}.json") }) { Text("导出备份") }
        TextButton(onClick = { importLauncher.launch(arrayOf("application/json")) }) { Text("导入备份") }
        TextButton(onClick = { confirmClear = true }) { Text("清空本机记录") }
        if (confirmClear) {
            Text("这会删除这台设备上的记录和照片。")
            Button(onClick = { confirmClear = false; model.clearLocal() }) { Text("确认清空") }
        }
    }
}

@Composable
private fun PageColumn(title: String, content: @Composable () -> Unit) {
    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 12.dp))
        content()
    }
}

private fun weekStart(): String {
    val today = localDate()
    val offset = (parseLocalDate(today).dayOfWeek.value + 6) % 7
    return shiftDate(today, -offset)
}
