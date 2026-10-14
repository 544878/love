package com.nana.levelup

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

data class LegacyImport(
    val data: JSONObject?,
    val photos: JSONObject,
    val token: String?,
    val session: String?,
    val page: String?,
    val date: String?
)

class LegacyWebMigration {
    @SuppressLint("SetJavaScriptEnabled")
    suspend fun importExisting(context: Context): LegacyImport? = suspendCancellableCoroutine { continuation ->
        val handler = Handler(Looper.getMainLooper())
        handler.post {
            val webView = WebView(context)
            webView.settings.javaScriptEnabled = true
            webView.settings.domStorageEnabled = true
            webView.addJavascriptInterface(object {
                @JavascriptInterface
                fun onResult(payload: String) {
                    if (!continuation.isActive) return
                    continuation.resume(parse(payload))
                    handler.post { webView.destroy() }
                }
            }, "AndroidMigration")
            webView.loadDataWithBaseURL("https://localhost/", PAGE, "text/html", "UTF-8", null)
            continuation.invokeOnCancellation { handler.post { webView.destroy() } }
        }
        handler.postDelayed({
            if (continuation.isActive) continuation.resume(null)
        }, 3000)
    }

    private fun parse(payload: String): LegacyImport? {
        return try {
            val json = JSONObject(payload)
            val data = json.optJSONObject("data")
            LegacyImport(
                data = data,
                photos = json.optJSONObject("photos") ?: JSONObject(),
                token = json.optString("token").ifEmpty { null },
                session = json.optString("session").ifEmpty { null },
                page = json.optString("page").ifEmpty { null },
                date = json.optString("date").ifEmpty { null }
            )
        } catch (_: Exception) {
            null
        }
    }

    private companion object {
        const val PAGE = """
<!doctype html><html><body><script>
(async function () {
  function finish(payload) {
    try { AndroidMigration.onResult(JSON.stringify(payload)); }
    catch (error) { AndroidMigration.onResult('{"data":null,"photos":{}}'); }
  }
  const result = { data: null, photos: {}, token: null, session: null, page: null, date: null };
  try {
    result.token = localStorage.getItem('lovelog.cloud.token');
    result.session = localStorage.getItem('lovelog.cloud.session');
    result.page = localStorage.getItem('lovelog.ui.page');
    result.date = localStorage.getItem('lovelog.ui.date');
  } catch (error) {}
  try {
    const db = await new Promise(function (resolve, reject) {
      const request = indexedDB.open('bloom-together-photos', 2);
      request.onupgradeneeded = function () {
        const database = request.result;
        if (!database.objectStoreNames.contains('photos')) database.createObjectStore('photos');
        if (!database.objectStoreNames.contains('appData')) database.createObjectStore('appData');
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
    result.data = await new Promise(function (resolve, reject) {
      const request = db.transaction('appData').objectStore('appData').get('current');
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { reject(request.error); };
    });
    result.photos = await new Promise(function (resolve, reject) {
      const store = db.transaction('photos').objectStore('photos');
      const keysRequest = store.getAllKeys();
      const valuesRequest = store.getAll();
      const finishRead = function () {
        if (!keysRequest.result || !valuesRequest.result) return;
        const photos = {};
        keysRequest.result.forEach(function (key, index) { photos[String(key)] = valuesRequest.result[index]; });
        resolve(photos);
      };
      keysRequest.onsuccess = finishRead;
      valuesRequest.onsuccess = finishRead;
      keysRequest.onerror = function () { reject(keysRequest.error); };
      valuesRequest.onerror = function () { reject(valuesRequest.error); };
    });
    db.close();
  } catch (error) {}
  if (!result.data) {
    try {
      const legacy = localStorage.getItem('bloom-together-data-v2') || localStorage.getItem('bloom-together-data-v1');
      if (legacy) result.data = JSON.parse(legacy);
    } catch (error) {}
  }
  finish(result);
})();
</script></body></html>
"""
    }
}
