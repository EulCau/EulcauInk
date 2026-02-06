# EulCauInk - Web & Android Hybrid Notebook

## Project Overview

This is a pure frontend React application designed to run inside an Android `WebView`. It features a CodeMirror markdown editor, a note list manager, and stylus handwriting support.

## 🛠 Web Development

1. Install dependencies: `npm install`
2. Run dev server: `npm run dev`

## 📦 How to Package for Android

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

## 📱 Android Integration Guide

### 1. Permissions (AndroidManifest.xml)

**CRITICAL:** You must add the Internet permission to load external images (e.g., `![img](https://...)`).

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.eulcauink">

    <!-- REQUIRED for loading external images -->
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.EulCauInk"
        android:usesCleartextTraffic="true"> <!-- Optional: Allow HTTP images -->
        
        <!-- ... activities ... -->
    </application>
</manifest>
```

### 2. Dependencies (build.gradle)

```groovy
implementation "androidx.webkit:webkit:1.9.0"
implementation "com.google.code.gson:gson:2.10.1" 
```

### 3. The Bridge (Kotlin Implementation)

Here is the recommended **Kotlin** implementation.
**Crucial:** Ensure `saveNote`, `loadNote`, and `deleteNote` all operate on the exact same directory (`notesDir`).

```kotlin
package com.example.eulcauink

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import android.widget.Toast
import com.google.gson.Gson
import java.io.File
import android.util.Base64

class WebAppInterface(private val context: Context) {

    // Define a consistent directory for notes
    private val notesDir: File = File(context.filesDir, "notes").apply {
        if (!exists()) mkdirs()
    }

    // Define a consistent directory for images
    private val imagesDir: File = File(context.filesDir, "images").apply {
        if (!exists()) mkdirs()
    }

    // --- Image Handling ---
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

    // --- Note Handling ---

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
    fun loadNote(filename: String): String {
        val file = File(notesDir, filename)
        return if (file.exists()) file.readText() else ""
    }

    @JavascriptInterface
    fun saveNote(filename: String, content: String) {
        val file = File(notesDir, filename)
        file.writeText(content)
    }

    @JavascriptInterface
    fun deleteNote(filename: String): Boolean {
        // MUST use the same notesDir as saveNote
        val file = File(notesDir, filename)
        if (file.exists()) {
            return file.delete()
        }
        return false
    }

    @JavascriptInterface
    fun showToast(msg: String) {
        Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
    }

    // --- System Actions ---
    
    @JavascriptInterface
    fun openExternalLink(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            showToast("Cannot open link: " + e.message)
        }
    }
}
```

### 4. WebView Setup

Configure `WebSettings` to allow mixed content and DOM storage.

```kotlin
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
// ... other imports

// In your Activity or Fragment:
val webView: WebView = findViewById(R.id.webview)

webView.settings.apply {
    javaScriptEnabled = true
    domStorageEnabled = true // Required for localStorage
    databaseEnabled = true
    
    // CRITICAL: Allows loading http/https images when running from file:// or custom schemes
    mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW 
}

// AssetLoader Configuration
val assetLoader = WebViewAssetLoader.Builder()
    .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
    // Map https://eulcauink.local/user-images/ to your internal imagesDir
    .addPathHandler("/user-images/", WebViewAssetLoader.InternalStoragePathHandler(this, File(filesDir, "images"))) 
    .build()

webView.webViewClient = object : WebViewClient() {
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        return assetLoader.shouldInterceptRequest(request.url)
    }
}

// Attach JS Interface
webView.addJavascriptInterface(WebAppInterface(this), "Android")

// Load the app
// Note: Using the virtual domain defined in imageService.ts ensures consistency
webView.loadUrl("https://eulcauink.local/assets/index.html")
// OR if not using asset loader strictly for html:
// webView.loadUrl("file:///android_asset/index.html")
```

## ✍️ Handwriting Logic

The Canvas component strictly listens to `pointerType === 'pen'` for native-like palm rejection.
