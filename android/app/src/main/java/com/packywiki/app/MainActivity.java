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

import android.content.ComponentName;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.webkit.JavascriptInterface;

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
        // The web side calls WiklodoIcon.setIcon(themeId) when the theme
        // changes, and the launcher icon follows it. See IconBridge below.
        webView.addJavascriptInterface(new IconBridge(), "WiklodoIcon");
        settings.setDomStorageEnabled(true);
        // Honour <meta name="viewport" content="width=device-width">. Without
        // this the WebView lays the page out at its own default width rather
        // than the device's, so every `max-width` media query in the
        // stylesheet is measured against the wrong number and the app gets
        // the desktop layout on a phone.
        settings.setUseWideViewPort(true);
        // NEVER zoom the page out to fit its widest content. With this on,
        // any element that strayed past the right edge (a particle, a wide
        // row) made the WebView shrink the whole app into a pannable
        // "desktop" view. The layout is width=device-width, always.
        settings.setLoadWithOverviewMode(false);
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
                // "Read →" points at wikipedia.org - hand it to the browser
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
        ensureSomeIcon();
    }

    /**
     * The player put the game away (home, recents, another app). With nothing
     * on screen to lose, this is the moment the launcher icon may change.
     * A rotation also stops the activity; that is not putting the game away.
     */
    @Override
    protected void onStop() {
        super.onStop();
        if (!isChangingConfigurations()) applyPendingIcon();
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

    /**
     * Switches the launcher icon by flipping which activity-alias is enabled.
     * One alias per theme exists in the manifest.
     *
     * Flipping an alias while the app is on screen can take the process down
     * with it on some builds of Android, whatever DONT_KILL_APP asks for, and
     * a player who changes a theme should never be thrown out of the game for
     * it. So setIcon() only WRITES the wish down; the switch happens once the
     * player has put the game away (onStop), the new alias switched on before
     * any other is switched off. If a session is killed before that, the wish
     * simply waits for the next time the game is put away.
     */
    private static final String[] ICON_THEMES = {
            "aurora", "paper", "arcade", "noir", "sunset",
            "meadow", "cartoon", "matrix", "casino", "horror",
            // Behind secret codes. The aliases exist whatever happens, since a
            // theme the web layer can ask for must have somewhere to land.
            "apotheosis", "raclette", "lecture", "yaourt"
    };

    private static final String ICON_PREFS = "wiklodo.icon";
    private static final String KEY_WANTED = "wanted";
    private static final String KEY_APPLIED = "applied";

    private final class IconBridge {
        @JavascriptInterface
        public void setIcon(String themeId) {
            String chosen = null;
            for (String t : ICON_THEMES) if (t.equals(themeId)) { chosen = t; break; }
            if (chosen == null) return;
            getSharedPreferences(ICON_PREFS, MODE_PRIVATE).edit().putString(KEY_WANTED, chosen).apply();
        }
    }

    /**
     * Applies a pending icon wish. The order is the whole safety of it: the
     * wanted alias is ENABLED first and read back, and only once the system
     * confirms it is on are the others disabled. There is never a moment with
     * no launcher entry at all, which is the one way an app can vanish from a
     * phone, and a wish that cannot be honoured is simply left pending.
     */
    private void applyPendingIcon() {
        SharedPreferences prefs = getSharedPreferences(ICON_PREFS, MODE_PRIVATE);
        String wanted = prefs.getString(KEY_WANTED, null);
        if (wanted == null) return;
        if (wanted.equals(prefs.getString(KEY_APPLIED, null))) return;
        boolean known = false;
        for (String t : ICON_THEMES) if (t.equals(wanted)) { known = true; break; }
        if (!known) return;
        PackageManager pm = getPackageManager();
        ComponentName chosen = alias(wanted);
        try {
            pm.setComponentEnabledSetting(chosen,
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            if (pm.getComponentEnabledSetting(chosen) != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) return;
        } catch (RuntimeException e) {
            return;
        }
        for (String t : ICON_THEMES) {
            if (t.equals(wanted)) continue;
            try {
                pm.setComponentEnabledSetting(alias(t),
                        PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            } catch (RuntimeException ignored) {
                // One alias that will not switch off is a second icon, not a
                // missing app. Carry on.
            }
        }
        prefs.edit().putString(KEY_APPLIED, wanted).apply();
    }

    /**
     * The safety net for the state this class exists to prevent: if no
     * launcher alias is enabled (a switch the system interrupted, an older
     * build), the default one is switched back on so the app can be found.
     */
    private void ensureSomeIcon() {
        PackageManager pm = getPackageManager();
        for (String t : ICON_THEMES) {
            int state = pm.getComponentEnabledSetting(alias(t));
            if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) return;
            // DEFAULT means "as the manifest says", and only aurora ships enabled.
            if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && t.equals(ICON_THEMES[0])) return;
        }
        try {
            pm.setComponentEnabledSetting(alias(ICON_THEMES[0]),
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        } catch (RuntimeException ignored) { }
    }

    private ComponentName alias(String theme) {
        return new ComponentName(getApplicationContext(), "com.packywiki.app.Icon_" + theme);
    }
}
