package com.nana.levelup

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.net.Uri
import android.util.Base64
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

fun JSONObject.array(name: String): JSONArray = optJSONArray(name) ?: JSONArray()

fun JSONArray.objects(): List<JSONObject> = List(length()) { getJSONObject(it) }

fun JSONObject.string(name: String, fallback: String = ""): String = optString(name).ifEmpty { fallback }

fun decodeDataUrl(dataUrl: String?): ImageBitmap? {
    if (dataUrl.isNullOrBlank()) return null
    val comma = dataUrl.indexOf(',')
    if (comma < 0 || !dataUrl.startsWith("data:image/")) return null
    return try {
        val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    } catch (_: Exception) {
        null
    }
}

fun compressImage(bytes: ByteArray): String {
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return ""
    val max = 1400f
    val scale = minOf(1f, max / maxOf(decoded.width, decoded.height))
    val width = (decoded.width * scale).toInt().coerceAtLeast(1)
    val height = (decoded.height * scale).toInt().coerceAtLeast(1)
    val scaled = Bitmap.createScaledBitmap(decoded, width, height, true)
    val output = ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.JPEG, 82, output)
    val encoded = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
    return "data:image/jpeg;base64,$encoded"
}

fun renderShareCard(data: JSONObject, date: String): Bitmap {
    val bitmap = Bitmap.createBitmap(1080, 1440, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val background = Paint().apply { color = 0xFFFFF6F2.toInt() }
    canvas.drawRect(0f, 0f, 1080f, 1440f, background)
    val title = Paint().apply { color = 0xFF5C3A42.toInt(); textSize = 64f; isFakeBoldText = true }
    val body = Paint().apply { color = 0xFF6E5360.toInt(); textSize = 40f }
    canvas.drawText("LoveLog", 80f, 160f, title)
    canvas.drawText(date, 80f, 240f, body)
    val report = data.array("reports").objects().firstOrNull { it.optString("date") == date }
    val lines = listOf(
        "心情 ${report?.optString("mood").orEmpty().ifEmpty { "还没写下" }}",
        "学习 ${report?.optInt("studyMinutes") ?: 0} 分钟",
        "重点 ${report?.optString("studyFocus").orEmpty().ifEmpty { "今天也被认真记住了" }}",
        report?.optString("lifeNote").orEmpty()
    )
    lines.forEachIndexed { index, line -> canvas.drawText(line.take(24), 80f, 380f + index * 80f, body) }
    return bitmap
}

fun readText(context: android.content.Context, uri: Uri): String {
    return context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }.orEmpty()
}

fun readBytes(context: android.content.Context, uri: Uri): ByteArray {
    return context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: byteArrayOf()
}
