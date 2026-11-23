package com.ccd.abetteryou

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.view.View
import android.view.ViewGroup
import android.webkit.DownloadListener
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader
import java.io.InputStream
import java.net.URLConnection

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var assetLoader: WebViewAssetLoader
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null

    // Secure HTTPS virtual origin via AndroidX WebViewAssetLoader (never uses file:// URLs)
    private val localAssetOrigin = "https://appassets.androidplatform.net"
    private val localAssetIndexUrl = "$localAssetOrigin/index.html"

    // Fallback live hosted app endpoint if local bundled assets are not present
    private val hostedAppUrl = "https://ais-pre-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app"

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val intent = result.data
            val uris: Array<Uri>? = when {
                intent?.clipData != null -> {
                    val count = intent.clipData!!.itemCount
                    Array(count) { i -> intent.clipData!!.getItemAt(i).uri }
                }
                intent?.data != null -> arrayOf(intent.data!!)
                else -> null
            }
            fileUploadCallback?.onReceiveValue(uris)
        } else {
            fileUploadCallback?.onReceiveValue(null)
        }
        fileUploadCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Configure WebViewAssetLoader to serve bundled assets/dist/* over https://appassets.androidplatform.net/*
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/") { path ->
                val cleanPath = path.trimStart('/').ifEmpty { "index.html" }
                openBundledDistAsset(cleanPath) ?: openBundledDistAsset("index.html")
            }
            .build()

        val rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(0xFF0B0C10.toInt())
        }

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(0xFF0B0C10.toInt())
        }

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                8
            )
            max = 100
            progress = 0
            visibility = View.GONE
        }

        rootLayout.addView(webView)
        rootLayout.addView(progressBar)
        setContentView(rootLayout)

        configureWebView()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        loadApplication()
    }

    private fun openBundledDistAsset(relativePath: String): WebResourceResponse? {
        return try {
            val assetPath = "dist/$relativePath"
            val inputStream: InputStream = assets.open(assetPath)
            val mimeType = guessMimeType(relativePath)
            WebResourceResponse(mimeType, "UTF-8", inputStream)
        } catch (_: Exception) {
            null
        }
    }

    private fun guessMimeType(path: String): String {
        val lower = path.lowercase()
        return when {
            lower.endsWith(".html") -> "text/html"
            lower.endsWith(".js") || lower.endsWith(".mjs") -> "application/javascript"
            lower.endsWith(".css") -> "text/css"
            lower.endsWith(".json") -> "application/json"
            lower.endsWith(".svg") -> "image/svg+xml"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".webp") -> "image/webp"
            lower.endsWith(".woff2") -> "font/woff2"
            lower.endsWith(".woff") -> "font/woff"
            lower.endsWith(".pdf") -> "application/pdf"
            lower.endsWith(".zip") -> "application/zip"
            else -> URLConnection.guessContentTypeFromName(path) ?: "application/octet-stream"
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.setSupportMultipleWindows(true)
        settings.javaScriptCanOpenWindowsAutomatically = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // Normalize WebView User-Agent so Google OAuth / Gmail sign-in does not reject with 403 disallowed_useragent
        val defaultUa = settings.userAgentString
        settings.userAgentString = defaultUa.replace("; wv", "").replace("Version/4.0 ", "")

        webView.setDownloadListener(DownloadListener { url, _, _, _, _ ->
            try {
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                }
            } catch (_: Exception) {}
        })

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onShowFileChooser(
                mWebView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    putExtra(
                        Intent.EXTRA_MIME_TYPES,
                        arrayOf(
                            "application/pdf",
                            "image/*",
                            "application/msword",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        )
                    )
                }

                try {
                    filePickerLauncher.launch(intent)
                } catch (_: Exception) {
                    fileUploadCallback?.onReceiveValue(null)
                    fileUploadCallback = null
                    return false
                }
                return true
            }

            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message?
            ): Boolean {
                // Fullscreen in-app dialog for Google OAuth / Gmail login popups
                val authDialog = android.app.Dialog(
                    this@MainActivity,
                    android.R.style.Theme_Black_NoTitleBar_Fullscreen
                )
                val popupWebView = WebView(this@MainActivity).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    this.settings.javaScriptEnabled = true
                    this.settings.domStorageEnabled = true
                    this.settings.setSupportMultipleWindows(true)
                    val pUa = this.settings.userAgentString
                    this.settings.userAgentString = pUa.replace("; wv", "").replace("Version/4.0 ", "")
                    webChromeClient = object : WebChromeClient() {
                        override fun onCloseWindow(window: WebView?) {
                            try {
                                authDialog.dismiss()
                            } catch (_: Exception) {}
                        }
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView?,
                            request: WebResourceRequest?
                        ): Boolean {
                            return false
                        }
                    }
                }
                authDialog.setContentView(popupWebView)
                try {
                    authDialog.show()
                } catch (_: Exception) {}

                val transport = resultMsg?.obj as? WebView.WebViewTransport
                transport?.webView = popupWebView
                resultMsg?.sendToTarget()
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val uri = request?.url ?: return null
                return assetLoader.shouldInterceptRequest(uri)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return false
                val scheme = uri.scheme?.lowercase() ?: ""

                if (scheme == "mailto" || scheme == "tel" || scheme == "whatsapp") {
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        true
                    } catch (_: Exception) {
                        false
                    }
                }

                val host = uri.host?.lowercase() ?: ""
                if (host.contains("github.com")) {
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        true
                    } catch (_: Exception) {
                        false
                    }
                }

                if (host.contains("accounts.google.com") || host.contains("google.com/recaptcha")) {
                    return false
                }

                return false
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    val failingUrl = request.url?.toString() ?: ""
                    // If remote URL failed and bundled assets exist, fall back to bundled WebViewAssetLoader origin
                    if (!failingUrl.startsWith(localAssetOrigin) && hasBundledAssets()) {
                        view?.loadUrl(localAssetIndexUrl)
                        return
                    }
                    // Render clean offline error screen with retry button
                    val offlineHtml = """
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                          <meta charset="UTF-8" />
                          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                          <title>ZENVIK Agent — Offline</title>
                          <style>
                            body { background:#0B0C10; color:#F8FAFC; font-family:system-ui,-apple-system,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; box-sizing:border-box; }
                            .card { max-width:420px; width:100%; background:#141822; border:1px solid rgba(255,255,255,0.1); border-radius:24px; padding:28px; text-align:center; }
                            h1 { font-size:20px; margin:0 0 10px; }
                            p { font-size:13px; color:#94A3B8; line-height:1.6; margin:0 0 20px; }
                            button { background:#10B981; color:#052E16; border:none; border-radius:14px; padding:12px 20px; font-weight:700; font-size:13px; width:100%; cursor:pointer; }
                          </style>
                        </head>
                        <body>
                          <div class="card">
                            <h1>Connection Unavailable</h1>
                            <p>ZENVIK Agent could not reach the network. Check your internet connection and tap Retry below.</p>
                            <button onclick="window.location.reload()">Retry Connection</button>
                          </div>
                        </body>
                        </html>
                    """.trimIndent()
                    view?.loadDataWithBaseURL(localAssetOrigin, offlineHtml, "text/html", "UTF-8", null)
                }
            }
        }
    }

    private fun hasBundledAssets(): Boolean {
        return try {
            val files = assets.list("dist")
            files != null && files.isNotEmpty()
        } catch (_: Exception) {
            false
        }
    }

    private fun loadApplication() {
        if (hasBundledAssets()) {
            webView.loadUrl(localAssetIndexUrl)
            return
        }
        webView.loadUrl(hostedAppUrl)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
