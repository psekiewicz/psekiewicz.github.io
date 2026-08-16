package io.github.psekiewicz.showcase;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The whole app: one WebView showing showcase, plus the handful of things the
 * WebView can't do on its own — send content to the share sheet, save a file,
 * play video fullscreen, and hand off-site links to a real browser.
 */
public class MainActivity extends AppCompatActivity {

    private static final String BRIDGE_OBJECT = "ShowcaseHost";
    private static final String STATE_WEBVIEW = "webview";

    /**
     * The oldest Chromium the site actually runs on. Its scripts are ES modules
     * using dynamic import and Object.fromEntries, and the stylesheet lays out
     * with `aspect-ratio` and flexbox `gap` — M88 is where the last of those
     * landed. It is also where this app's own page bridge becomes available.
     * Below it the page renders blank or badly broken, which is worth saying out
     * loud rather than showing an empty screen.
     */
    private static final int MIN_WEBVIEW_MAJOR = 88;

    private WebView webView;
    private View messageView;
    private FrameLayout fullscreenContainer;
    private View rootView;

    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private int orientationBeforeFullscreen = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;

    /** Set when the main frame fails to load, cleared on the next successful page. */
    private boolean mainFrameFailed;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private Set<String> allowedOrigins;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        // Drops the splash window background; from here on the WebView paints.
        setTheme(R.style.Theme_Showcase);
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);

        allowedOrigins = Collections.singleton(getString(R.string.site_origin));

        rootView = findViewById(R.id.root);
        webView = findViewById(R.id.webview);
        messageView = findViewById(R.id.message);
        fullscreenContainer = findViewById(R.id.fullscreen_container);

        applyInsetPadding(webView);
        applyInsetPadding(messageView);

        configureWebView();
        registerBridge();
        registerBackHandling();
        pruneShareCache();

        PackageInfo webViewPackage = outdatedWebView();
        if (webViewPackage != null) {
            showOutdatedWebView(webViewPackage);
            return;
        }

        if (savedInstanceState != null) {
            Bundle state = savedInstanceState.getBundle(STATE_WEBVIEW);
            if (state != null) {
                webView.restoreState(state);
                return;
            }
        }
        webView.loadUrl(startUrl(getIntent()));
    }

    /**
     * Keeps the page laid out between the system bars the way it would be in a
     * browser, while the bars themselves stay transparent over the page colour.
     * The IME is folded into the bottom inset because an edge-to-edge window on
     * Android 15 no longer resizes itself when the keyboard opens.
     */
    private void applyInsetPadding(View view) {
        ViewCompat.setOnApplyWindowInsetsListener(view, (v, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return insets;
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        // Without this the WebView invents a 980px-wide viewport and ignores the
        // page's own `width=device-width`, which would render the phone layout
        // zoomed out to desktop proportions.
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        // Everything the site opens is an embed on its own page; nothing here
        // ever asks for a second window.
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " Showcase/" + BuildConfig.VERSION_NAME);

        // The stylesheet declares `color-scheme`, so this lets the page's own
        // dark theme answer `prefers-color-scheme` instead of the WebView
        // inverting the light one.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, true);
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                mainFrameFailed = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!mainFrameFailed) showPage();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    mainFrameFailed = true;
                    showOffline();
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The renderer died (usually the system reclaiming memory while
                // the app was backgrounded). The WebView is unusable now, so
                // tear it down and start the activity over rather than let the
                // whole process be killed.
                ViewGroup parent = (ViewGroup) view.getParent();
                if (parent != null) parent.removeView(view);
                view.destroy();
                webView = null;
                recreate();
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                enterFullscreen(view, callback);
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }
        });

        // Nothing on the site serves a file over http(s), but if one ever links
        // to a download, the browser is better equipped to finish it than we are.
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                openExternally(Uri.parse(url));
            }
        });
    }

    /* ---------------- navigation ---------------- */

    private String startUrl(@Nullable Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            Uri data = intent.getData();
            if (isSiteUrl(data)) return data.toString();
        }
        return getString(R.string.site_url);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null
                && isSiteUrl(intent.getData())) {
            webView.loadUrl(intent.getData().toString());
        }
    }

    private boolean isSiteUrl(@Nullable Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        return ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                && getString(R.string.site_host).equalsIgnoreCase(uri.getHost());
    }

    /** @return true when the app took the URL somewhere other than this WebView. */
    private boolean handleUrl(Uri uri) {
        if (isSiteUrl(uri)) return false;

        String scheme = uri.getScheme();
        if (scheme == null) return false;
        // Embedded players and generated images resolve through these; they are
        // page-internal and must stay in the WebView.
        if (scheme.equals("blob") || scheme.equals("data") || scheme.equals("about")) return false;

        if (scheme.equals("intent")) {
            try {
                Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                startActivity(intent);
            } catch (Exception err) {
                toast(getString(R.string.no_browser));
            }
            return true;
        }

        openExternally(uri);
        return true;
    }

    private void openExternally(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri)
                .addCategory(Intent.CATEGORY_BROWSABLE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException err) {
            toast(getString(R.string.no_browser));
        }
    }

    private void registerBackHandling() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (customView != null) {
                    exitFullscreen();
                    return;
                }
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }

    /* ---------------- offline state ---------------- */

    /**
     * Takes over the screen with an explanation and a way out. {@code secondary}
     * is optional and only used where the app might be wrong about the problem.
     */
    private void showMessage(int titleRes, int bodyRes, int actionRes, Runnable action,
                             int secondaryRes, @Nullable Runnable secondary) {
        ((TextView) findViewById(R.id.message_title)).setText(titleRes);
        ((TextView) findViewById(R.id.message_body)).setText(bodyRes);

        Button primary = findViewById(R.id.message_action);
        primary.setText(actionRes);
        primary.setOnClickListener(v -> action.run());

        Button secondaryButton = findViewById(R.id.message_secondary);
        if (secondary == null) {
            secondaryButton.setVisibility(View.GONE);
        } else {
            secondaryButton.setText(secondaryRes);
            secondaryButton.setOnClickListener(v -> secondary.run());
            secondaryButton.setVisibility(View.VISIBLE);
        }

        messageView.setVisibility(View.VISIBLE);
        if (webView != null) webView.setVisibility(View.INVISIBLE);
    }

    private void showOffline() {
        if (webView == null) return;
        showMessage(R.string.offline_title, R.string.offline_body, R.string.offline_retry,
                this::retry, 0, null);
    }

    private void showPage() {
        if (webView == null) return;
        messageView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
    }

    /**
     * The app is only as capable as the WebView the phone provides, and that is
     * updated separately from Android itself — an Android 7 phone kept current
     * through the Play Store runs a far newer engine than an Android 7 emulator
     * image that has never been updated.
     *
     * @return the WebView package when it is too old to run the site, else null.
     */
    @Nullable
    private PackageInfo outdatedWebView() {
        PackageInfo info = WebViewCompat.getCurrentWebViewPackage(this);
        if (info == null || info.versionName == null) return null;

        int dot = info.versionName.indexOf('.');
        String major = dot == -1 ? info.versionName : info.versionName.substring(0, dot);
        try {
            return Integer.parseInt(major) < MIN_WEBVIEW_MAJOR ? info : null;
        } catch (NumberFormatException err) {
            // An unrecognisable version string is no reason to block the app.
            return null;
        }
    }

    private void showOutdatedWebView(PackageInfo webViewPackage) {
        showMessage(R.string.webview_old_title, R.string.webview_old_body,
                R.string.webview_old_action, () -> openStorePage(webViewPackage.packageName),
                R.string.webview_old_continue, () -> {
                    showPage();
                    webView.loadUrl(startUrl(getIntent()));
                });
    }

    private void openStorePage(String packageName) {
        Intent store = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + packageName))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(store);
        } catch (ActivityNotFoundException err) {
            openExternally(Uri.parse("https://play.google.com/store/apps/details?id=" + packageName));
        }
    }

    private void retry() {
        if (webView == null) return;
        mainFrameFailed = false;
        showPage();
        String current = webView.getUrl();
        if (current == null || current.startsWith("data:")) {
            webView.loadUrl(startUrl(getIntent()));
        } else {
            webView.reload();
        }
    }

    /* ---------------- fullscreen video ---------------- */

    private void enterFullscreen(View view, WebChromeClient.CustomViewCallback callback) {
        if (customView != null) {
            callback.onCustomViewHidden();
            return;
        }
        customView = view;
        customViewCallback = callback;
        orientationBeforeFullscreen = getRequestedOrientation();

        fullscreenContainer.addView(view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        fullscreenContainer.setVisibility(View.VISIBLE);
        webView.setVisibility(View.GONE);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), rootView);
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    private void exitFullscreen() {
        if (customView == null) return;

        fullscreenContainer.removeView(customView);
        fullscreenContainer.setVisibility(View.GONE);
        customView = null;
        webView.setVisibility(View.VISIBLE);

        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }

        WindowCompat.getInsetsController(getWindow(), rootView)
                .show(WindowInsetsCompat.Type.systemBars());
        setRequestedOrientation(orientationBeforeFullscreen);
    }

    /* ---------------- page ↔ app bridge ---------------- */

    /**
     * Wires up {@code bridge.js}. Both halves are scoped to the site's own
     * origin, so an embedded YouTube or Spotify player can't reach the app.
     * On a WebView too old for either API the site simply keeps the behaviour
     * it has in any browser without the Web Share API.
     */
    private void registerBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;

        String script = readAsset("bridge.js");
        if (script == null) return;

        WebViewCompat.addWebMessageListener(webView, BRIDGE_OBJECT, allowedOrigins,
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame) return;
                    onBridgeMessage(message, replyProxy);
                });
        WebViewCompat.addDocumentStartJavaScript(webView, script, allowedOrigins);
    }

    private void onBridgeMessage(WebMessageCompat message, JavaScriptReplyProxy replyProxy) {
        if (message.getType() != WebMessageCompat.TYPE_STRING || message.getData() == null) return;

        final String id;
        final String action;
        final JSONObject payload;
        try {
            JSONObject request = new JSONObject(message.getData());
            id = request.getString("id");
            action = request.getString("action");
            payload = request.optJSONObject("payload");
        } catch (JSONException err) {
            return;
        }

        JSONObject args = payload != null ? payload : new JSONObject();
        switch (action) {
            case "shareText":
                shareText(args);
                reply(replyProxy, id, null, null);
                break;
            case "shareFile":
                writeAndSend(replyProxy, id, args, true);
                break;
            case "saveFile":
                writeAndSend(replyProxy, id, args, false);
                break;
            case "theme":
                applyPageColor(args.optString("color"));
                reply(replyProxy, id, null, null);
                break;
            default:
                reply(replyProxy, id, "Unknown action", null);
                break;
        }
    }

    // A reply proxy only exists because the message listener fired, and that
    // listener is only ever registered behind the WEB_MESSAGE_LISTENER check in
    // registerBridge() — a chain lint can't follow from here.
    @SuppressLint("RequiresFeature")
    private void reply(JavaScriptReplyProxy replyProxy, String id, @Nullable String error,
                       @Nullable String errorName) {
        JSONObject response = new JSONObject();
        try {
            response.put("id", id);
            response.put("ok", error == null);
            if (error != null) response.put("error", error);
            if (errorName != null) response.put("name", errorName);
        } catch (JSONException err) {
            return;
        }
        String json = response.toString();
        mainHandler.post(() -> replyProxy.postMessage(json));
    }

    private void shareText(JSONObject args) {
        String text = args.optString("text");
        String url = args.optString("url");
        String body = text.isEmpty() ? url : (url.isEmpty() ? text : text + "\n" + url);

        Intent send = new Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, body);
        if (!args.optString("title").isEmpty()) {
            send.putExtra(Intent.EXTRA_SUBJECT, args.optString("title"));
        }
        startActivity(Intent.createChooser(send, getString(R.string.share_chooser)));
    }

    /**
     * Decodes the base64 payload off the UI thread, then either hands it to the
     * share sheet or writes it into Downloads.
     */
    private void writeAndSend(JavaScriptReplyProxy replyProxy, String id, JSONObject args,
                              boolean share) {
        final String name = sanitizeFileName(args.optString("name", "showcase"));
        final String mime = args.optString("mime", "application/octet-stream");
        final String data = args.optString("data");

        io.execute(() -> {
            final byte[] bytes;
            try {
                bytes = Base64.decode(data, Base64.DEFAULT);
            } catch (IllegalArgumentException err) {
                reply(replyProxy, id, "Could not read the file", null);
                return;
            }

            try {
                if (share) {
                    Uri uri = writeToShareCache(name, bytes);
                    mainHandler.post(() -> {
                        sendFile(uri, mime, args.optString("title"), args.optString("text"));
                        reply(replyProxy, id, null, null);
                    });
                } else if (saveToDownloads(name, mime, bytes)) {
                    mainHandler.post(() -> toast(getString(R.string.saved_to_downloads)));
                    reply(replyProxy, id, null, null);
                } else {
                    // Below API 29 there is no permission-free Downloads folder,
                    // so the share sheet stands in — the user can still file the
                    // image wherever they want from there.
                    Uri uri = writeToShareCache(name, bytes);
                    mainHandler.post(() -> {
                        sendFile(uri, mime, "", "");
                        reply(replyProxy, id, null, null);
                    });
                }
            } catch (IOException err) {
                mainHandler.post(() -> toast(getString(R.string.save_failed)));
                reply(replyProxy, id, "Could not save the file", null);
            }
        });
    }

    /**
     * Shared files only need to outlive the share sheet, but nothing tells us
     * when that closes, so yesterday's are swept on the next launch instead.
     */
    private void pruneShareCache() {
        io.execute(() -> {
            File[] files = new File(getCacheDir(), "shared").listFiles();
            if (files == null) return;
            long cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L;
            for (File file : files) {
                if (file.lastModified() < cutoff) //noinspection ResultOfMethodCallIgnored
                    file.delete();
            }
        });
    }

    private Uri writeToShareCache(String name, byte[] bytes) throws IOException {
        File dir = new File(getCacheDir(), "shared");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Could not create the share folder");
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
    }

    private void sendFile(Uri uri, String mime, String title, String text) {
        Intent send = new Intent(Intent.ACTION_SEND)
                .setType(mime)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        // Some targets read the attachment off the clip data rather than the
        // extra, and it is also what carries the URI permission grant.
        send.setClipData(ClipData.newRawUri("", uri));
        if (!text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
        if (!title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        startActivity(Intent.createChooser(send, getString(R.string.share_chooser)));
    }

    /** @return false when this Android version has no permission-free Downloads folder. */
    private boolean saveToDownloads(String name, String mime, byte[] bytes) throws IOException {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false;

        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
        values.put(MediaStore.Downloads.MIME_TYPE, mime);
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
        Uri item = getContentResolver().insert(collection, values);
        if (item == null) throw new IOException("Downloads rejected the file");

        try (OutputStream out = getContentResolver().openOutputStream(item)) {
            if (out == null) throw new IOException("Downloads rejected the file");
            out.write(bytes);
        }

        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        getContentResolver().update(item, values, null, null);
        return true;
    }

    private static String sanitizeFileName(String name) {
        String cleaned = name.replaceAll("[^A-Za-z0-9._-]", "-");
        if (cleaned.isEmpty() || cleaned.equals(".") || cleaned.equals("..")) cleaned = "showcase";
        return cleaned.length() > 100 ? cleaned.substring(cleaned.length() - 100) : cleaned;
    }

    /* ---------------- status bar tint ---------------- */

    /** Paints the window behind the transparent system bars in the page's own colour. */
    private void applyPageColor(String cssColor) {
        Integer color = parseCssColor(cssColor);
        if (color == null) return;
        mainHandler.post(() -> {
            rootView.setBackgroundColor(color);
            getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(color));
            boolean light = luminance(color) > 0.5;
            WindowCompat.getInsetsController(getWindow(), rootView)
                    .setAppearanceLightStatusBars(light);
            WindowCompat.getInsetsController(getWindow(), rootView)
                    .setAppearanceLightNavigationBars(light);
        });
    }

    /** Handles the `rgb(r, g, b)` / `rgba(r, g, b, a)` form getComputedStyle returns. */
    @Nullable
    private static Integer parseCssColor(@Nullable String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        if (trimmed.startsWith("#")) {
            try {
                return Color.parseColor(trimmed);
            } catch (IllegalArgumentException err) {
                return null;
            }
        }
        if (!trimmed.startsWith("rgb")) return null;

        int open = trimmed.indexOf('(');
        int close = trimmed.lastIndexOf(')');
        if (open < 0 || close <= open) return null;

        String[] parts = trimmed.substring(open + 1, close).split("[,/]");
        if (parts.length < 3) return null;
        try {
            int r = clampChannel(Float.parseFloat(parts[0].trim()));
            int g = clampChannel(Float.parseFloat(parts[1].trim()));
            int b = clampChannel(Float.parseFloat(parts[2].trim()));
            return Color.rgb(r, g, b);
        } catch (NumberFormatException err) {
            return null;
        }
    }

    private static int clampChannel(float value) {
        return Math.max(0, Math.min(255, Math.round(value)));
    }

    private static double luminance(int color) {
        return (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0;
    }

    /* ---------------- plumbing ---------------- */

    @Nullable
    private String readAsset(String name) {
        try (java.io.InputStream in = getAssets().open(name);
             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toString("UTF-8");
        } catch (IOException err) {
            return null;
        }
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView == null) return;
        Bundle state = new Bundle();
        webView.saveState(state);
        outState.putBundle(STATE_WEBVIEW, state);
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        io.shutdown();
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
