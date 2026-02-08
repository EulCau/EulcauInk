# EulCauInk - Web & Android Hybrid Notebook

## Project Overview

This is a pure frontend React application designed to run inside an Android `WebView`. It features a CodeMirror markdown editor, a note list manager, and stylus handwriting support. For more details, please refer to the README in the GitHub repository: [EulCau/EulCauInkApp](https://github.com/EulCau/EulCauInkApp).

## Web Development

1. Install dependencies: `npm install`
2. Run dev server: `npm run dev`

## How to Package for Android

1. Run the install command:

    ```bash
    npm install react react-dom lucide-react rehype-katex rehype-slug remark-math remark-gfm react-markdown @codemirror/view @uiw/react-codemirror @codemirror/lang-markdown @codemirror/language-data katex clsx tailwind-merge
    npm install -D tailwindcss@3.4.17 postcss autoprefixer @tailwindcss/typography
    npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
    ```

2. Run the build command:

    ```bash
    npm run build
    ```

    This generates the static files in the `dist/` folder.
3. Copy the **contents** of the `dist/` folder into your Android project's assets folder:
    `src/main/assets/`
4. Ensure your WebView loads `file:///android_asset/index.html` or uses the `WebViewAssetLoader` method described below (recommended).

## Android Integration Guide

### 1. Permissions (AndroidManifest.xml)

Add permissions and ensure `android:exported="true"` for the activity.

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.eulcauink">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.EulCauInk"
        android:usesCleartextTraffic="true">
        
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

### 2. Dependencies (build.gradle)

```groovy
implementation "androidx.webkit:webkit:1.9.0"
implementation "com.google.code.gson:gson:2.10.1" 
```

### 3. MainActivity.kt (Complete)

This handles the file pickers (images, markdown import/export) and bridges communication.

```kotlin
package com.example.eulcauink

import android.net.Uri
import android.os.Bundle
import android.webkit.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import com.google.gson.Gson
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    
    // Store content pending export until the user selects a file location
    private var pendingExportContent: String? = null

    // --- 1. Image Picker Launcher ---
    private val pickImageLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) {
            val filename = copyContentToInternal(uri, "images", "img_${System.currentTimeMillis()}.png")
            if (filename != null) {
                sendJsEvent("PICK_IMAGE_RESULT", filename)
            } else {
                sendJsEvent("ERROR", "Failed to copy image to internal storage")
            }
        }
    }

    // --- 2. Markdown Import Launcher ---
    private val importMdLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            try {
                // Read file content
                val inputStream = contentResolver.openInputStream(uri)
                val content = inputStream?.bufferedReader().use { it?.readText() } ?: ""
                
                // Try to get filename
                var filename = "imported.md"
                val cursor = contentResolver.query(uri, null, null, null, null)
                val nameIndex = cursor?.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (cursor != null && nameIndex != null && nameIndex >= 0 && cursor.moveToFirst()) {
                     filename = cursor.getString(nameIndex)
                     cursor.close()
                }

                // Send back to JS
                // We use Gson to escape the content string safely
                val jsonContent = Gson().toJson(content) 
                // Remove surrounding quotes from Gson output as we are passing it as a string argument
                // Actually, passing jsonContent directly as the second argument is safer if we treat it as a string literal in JS
                // But simpler approach:
                val script = "window.handleAndroidEvent('IMPORT_MD_RESULT', $jsonContent, '$filename')"
                webView.evaluateJavascript(script, null)
                
            } catch (e: Exception) {
                sendJsEvent("ERROR", "Import failed: ${e.message}")
            }
        }
    }

    // --- 3. Markdown Export Launcher ---
    private val exportMdLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("text/markdown")) { uri: Uri? ->
        if (uri != null && pendingExportContent != null) {
            try {
                contentResolver.openOutputStream(uri)?.use { 
                    it.write(pendingExportContent!!.toByteArray()) 
                }
                sendJsEvent("EXPORT_SUCCESS", uri.path ?: "Saved")
            } catch (e: Exception) {
                sendJsEvent("ERROR", "Export failed: ${e.message}")
            }
        }
        pendingExportContent = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize WebView programmatically
        webView = WebView(this)
        setContentView(webView)

        val imagesDir = File(filesDir, "images")
        if (!imagesDir.exists()) imagesDir.mkdirs()

        // Configure AssetLoader
        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("eulcauink.local")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/user-images/", WebViewAssetLoader.InternalStoragePathHandler(this, imagesDir))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false // Security best practice, use AssetLoader
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        
        WebView.setWebContentsDebuggingEnabled(true)

        // Pass reference of Activity to Interface so it can trigger launchers
        webView.addJavascriptInterface(WebAppInterface(this), "Android")

        webView.loadUrl("https://eulcauink.local/assets/index.html")
    }

    // --- Public methods called by WebAppInterface ---

    fun launchPickImage() {
        pickImageLauncher.launch("image/*")
    }

    fun launchImportMarkdown() {
        // MIME types for markdown can be tricky, allow text/* and generic
        importMdLauncher.launch(arrayOf("text/markdown", "text/plain", "*/*"))
    }

    fun launchExportMarkdown(content: String, filename: String) {
        pendingExportContent = content
        exportMdLauncher.launch(filename)
    }

    private fun sendJsEvent(type: String, data: String) {
        runOnUiThread {
            webView.evaluateJavascript("window.handleAndroidEvent('$type', '$data')", null)
        }
    }

    private fun copyContentToInternal(uri: Uri, dirName: String, outputFilename: String): String? {
        try {
            val inputStream = contentResolver.openInputStream(uri) ?: return null
            val dir = File(filesDir, dirName)
            if (!dir.exists()) dir.mkdirs()
            val file = File(dir, outputFilename)
            
            FileOutputStream(file).use { output ->
                inputStream.copyTo(output)
            }
            return outputFilename
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
```

### 4. WebAppInterface.kt (Updated)

Updated to call the Activity's launcher methods.

```kotlin
package com.example.eulcauink

import android.content.Context
import android.content.Intent
import android.util.Base64
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.net.toUri
import com.google.gson.Gson
import java.io.File

class WebAppInterface(private val activity: MainActivity) {

    private val context: Context = activity

    private val notesDir: File = File(context.filesDir, "notes").apply {
        if (!exists()) mkdirs()
    }

    private val imagesDir: File = File(context.filesDir, "images").apply {
        if (!exists()) mkdirs()
    }

    // ===== NEW: System Integration =====

    @JavascriptInterface
    fun triggerPickImage() {
        activity.launchPickImage()
    }

    @JavascriptInterface
    fun triggerImportMarkdown() {
        activity.launchImportMarkdown()
    }

    @JavascriptInterface
    fun triggerExportMarkdown(filename: String, content: String) {
        activity.launchExportMarkdown(content, filename)
    }

    // ===== Existing Logic =====

    @JavascriptInterface
    fun saveImage(base64Data: String, filename: String): String {
        try {
            val cleanBase64 = base64Data.substringAfter(",")
            val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)
            val file = File(imagesDir, filename)
            file.writeBytes(bytes)
            return filename
        } catch (e: Exception) {
            e.printStackTrace()
            return ""
        }
    }

    @JavascriptInterface
    fun saveNote(filename: String, content: String) {
        val file = File(notesDir, filename)
        file.writeText(content)
    }

    @JavascriptInterface
    fun loadNote(filename: String): String {
        val file = File(notesDir, filename)
        return if (file.exists()) file.readText() else ""
    }

    @JavascriptInterface
    fun getNoteList(): String {
        val list = notesDir.listFiles()
            ?.filter { it.extension == "md" }
            ?.map {
                mapOf(
                    "filename" to it.name,
                    "title" to it.nameWithoutExtension,
                    "updatedAt" to it.lastModified()
                )
            } ?: emptyList()
        return Gson().toJson(list)
    }

    @JavascriptInterface
    fun deleteNote(filename: String): Boolean {
        val file = File(notesDir, filename)
        if (file.exists()) return file.delete()
        return false
    }

    @JavascriptInterface
    fun showToast(msg: String) {
        Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
    }

    @JavascriptInterface
    fun openExternalLink(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, url.toUri())
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            showToast("Cannot open link: " + e.message)
        }
    }
}
```

## Handwriting Logic

The Canvas component strictly listens to `pointerType === 'pen'` for native-like palm rejection.

## License

This project is licensed under the MIT License.

## Acknowledgements

- Open-source communities including React, Tailwind CSS, CodeMirror, and Android WebView
- AI-assisted development with ChatGPT and google AI Studio
