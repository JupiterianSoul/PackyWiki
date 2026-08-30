package com.packywiki.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * PackyWiki is a static web app; this activity is just a host for it.
 *
 * The bundled build in assets/ is served through WebViewAssetLoader on a real
 * https:// origin rather than loaded over file://. That matters: WebView blocks
 * cross-origin fetch() from file:// pages, which would break every call to the
 * Wikipedia API. With a proper origin the app behaves exactly as it does in a
 * desktop browser, CORS and all.
 */
public class MainActivity extends Activity {

    /** Reserved by androidx.webkit for locally-served assets. */
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + APP_HOST + "/index.html";

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(APP_HOST)
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0A0B12"));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // Honour <meta name="viewport" content="width=device-width">. Without
        // this the WebView lays the page out at its own default width rather
        // than the device's, so every `max-width` media query in the
        // stylesheet is measured against the wrong number and the app gets
        // the desktop layout on a phone.
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        // The layout is responsive; pinch-zooming a native-feeling app only
        // ever produces a half-scrolled mess.
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        // The app gates its own AudioContext behind a tap, so this only stops
        // WebView from adding a second, redundant gesture requirement.
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (APP_HOST.equals(url.getHost())) {
                    return false;
                }
                // "Read →" points at wikipedia.org — hand it to the browser
                // rather than navigating away from the app.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException ignored) {
                    return false;
                }
                return true;
            }
        });

        setContentView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
