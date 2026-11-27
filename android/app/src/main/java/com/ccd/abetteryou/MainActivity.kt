package com.ccd.abetteryou

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
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
import androidx.browser.customtabs.CustomTabsIntent
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLConnection
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var assetLoader: WebViewAssetLoader
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private val probeExecutor = Executors.newSingleThreadExecutor()

    // Secure HTTPS virtual origin via AndroidX WebViewAssetLoader (never uses file:// URLs)
    private val localAssetOrigin = "https://appassets.androidplatform.net"
    private val localAssetIndexUrl = "$localAssetOrigin/index.html"

    // Live full-stack Cloud Run backend + frontend endpoint (injected via Gradle BuildConfig)
    private val hostedAppUrl: String = BuildConfig.APP_BACKEND_URL.ifBlank {
        "https://ais-pre-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app"
    }.trimEnd('/')

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
        // Never swallow /api/* or /healthz paths into index.html so backend requests always reach the server.
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/") { path ->
                val cleanPath = path.trimStart('/').ifEmpty { "index.html" }
                if (cleanPath == "api" || cleanPath.startsWith("api/") || cleanPath == "healthz") {
                    null
                } else {
                    openBundledDistAsset(cleanPath) ?: openBundledDistAsset("index.html")
                }
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
        handleOAuthDeepLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleOAuthDeepLink(intent)
    }

    private fun openExternalOAuthBrowser(uri: Uri) {
        try {
            val customTabsIntent = CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
            customTabsIntent.launchUrl(this, uri)
        } catch (_: Exception) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (_: Exception) {}
        }
    }

    private fun handleOAuthDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        val scheme = data.scheme?.lowercase() ?: return
        val host = data.host?.lowercase() ?: return
        if ((scheme == "com.ccd.abetteryou" || scheme == "zenvik") && host == "oauth") {
            val status = data.getQueryParameter("status") ?: "error"
            val gmailAddress = data.getQueryParameter("gmailAddress") ?: ""
            val error = data.getQueryParameter("error") ?: ""
            val payload = JSONObject().apply {
                put("status", status)
                put("connected", status == "success")
                put("gmailAddress", gmailAddress)
                put("error", error)
            }.toString()

            runOnUiThread {
                try {
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('zenvik_android_oauth_callback', { detail: $payload }));",
                        null
                    )
                } catch (_: Exception) {}
            }
        }
    }

    inner class ZenvikAndroidBridge {
        @JavascriptInterface
        fun isAndroidApp(): Boolean = true

        @JavascriptInterface
        fun openOAuthUrl(url: String) {
            val trimmed = url.trim()
            val uri = try { Uri.parse(trimmed) } catch (_: Exception) { return }
            val scheme = uri.scheme?.lowercase() ?: return
            val host = uri.host?.lowercase() ?: return
            if (scheme != "https") return
            val allowed = host == "accounts.google.com" ||
                host.endsWith(".run.app") ||
                trimmed.startsWith(hostedAppUrl)
            if (!allowed) return
            runOnUiThread {
                openExternalOAuthBrowser(uri)
            }
        }
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

        // Enable cookies & third-party cookies for Firebase Auth / Google OAuth / Gmail session persistence
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        // Normalize WebView User-Agent and expose native Chrome Custom Tabs OAuth bridge
        val defaultUa = settings.userAgentString
        settings.userAgentString = defaultUa.replace("; wv", "").replace("Version/4.0 ", "")
        webView.addJavascriptInterface(ZenvikAndroidBridge(), "ZenvikAndroid")

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

            override fun onPermissionRequest(request: PermissionRequest?) {
                val origin = request?.origin?.toString()?.trimEnd('/') ?: ""
                if (origin == localAssetOrigin || origin == hostedAppUrl || origin.endsWith(".run.app")) {
                    runOnUiThread {
                        try {
                            request?.grant(request.resources)
                        } catch (_: Exception) {
                            request?.deny()
                        }
                    }
                } else {
                    request?.deny()
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
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                    webChromeClient = object : WebChromeClient() {
                        override fun onCloseWindow(window: WebView?) {
                            try {
                                CookieManager.getInstance().flush()
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
                if (uri.host.equals("appassets.androidplatform.net", ignoreCase = true)) {
                    return assetLoader.shouldInterceptRequest(uri)
                }
                return null
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Always expose the live Cloud Run backend URL so bundled offline assets can also call /api/*
                val escapedUrl = hostedAppUrl.replace("\\", "\\\\").replace("\"", "\\\"")
                view?.evaluateJavascript(
                    "window.__ZENVIK_API_BASE__ = \"$escapedUrl\";",
                    null
                )
                CookieManager.getInstance().flush()
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

                // Route Google OAuth 2.0 Authorization Code Flow to Chrome Custom Tabs / external browser (never blocked WebView)
                if (host == "accounts.google.com" && (uri.path?.startsWith("/o/oauth2") == true)) {
                    openExternalOAuthBrowser(uri)
                    return true
                }

                if (host.contains("accounts.google.com") || host.contains("google.com/recaptcha")) {
                    return false
                }

                return false
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                if (request?.isForMainFrame == true) {
                    val statusCode = errorResponse?.statusCode ?: 0
                    val failingUrl = request.url?.toString() ?: ""
                    if (statusCode >= 400 && !failingUrl.startsWith(localAssetOrigin) && hasBundledAssets()) {
                        view?.loadUrl(localAssetIndexUrl)
                    }
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    val failingUrl = request.url?.toString() ?: ""
                    // If remote live backend failed and bundled assets exist, fall back seamlessly to local assets
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

    private fun isNetworkAvailable(): Boolean {
        return try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (_: Exception) {
            false
        }
    }

    private fun isLiveBackendHealthy(): Boolean {
        var connection: HttpURLConnection? = null
        return try {
            val url = URL("$hostedAppUrl/healthz")
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 3500
                readTimeout = 3500
                instanceFollowRedirects = true
            }
            connection.responseCode in 200..299
        } catch (_: Exception) {
            false
        } finally {
            try {
                connection?.disconnect()
            } catch (_: Exception) {}
        }
    }

    private fun loadApplication() {
        // Online-first: if the live full-stack Cloud Run backend is reachable, load it directly so
        // Express APIs, Gemini AI, English Zero-to-C2, Gmail OAuth, Job Discovery & Firestore run identically.
        // If offline or unreachable, fall back seamlessly to bundled WebViewAssetLoader assets.
        if (isNetworkAvailable()) {
            progressBar.visibility = View.VISIBLE
            probeExecutor.execute {
                val backendReady = isLiveBackendHealthy()
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    if (backendReady) {
                        webView.loadUrl(hostedAppUrl)
                    } else if (hasBundledAssets()) {
                        webView.loadUrl(localAssetIndexUrl)
                    } else {
                        webView.loadUrl(hostedAppUrl)
                    }
                }
            }
            return
        }

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
        super.onPause()
        CookieManager.getInstance().flush()
        webView.onPause()
    }

    override fun onDestroy() {
        try {
            probeExecutor.shutdownNow()
        } catch (_: Exception) {}
        webView.destroy()
        super.onDestroy()
    }
}
