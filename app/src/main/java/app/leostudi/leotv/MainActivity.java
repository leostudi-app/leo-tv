package app.leostudi.leotv;

import android.app.Activity;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * LEO for Fire TV: a full-screen WebView around play.leostudi.app.
 * - Sound plays without a tap (media gesture requirement disabled).
 * - LEO speaks through the device's own text-to-speech engine via the LeoNative JS bridge,
 *   because TV web views ship without the Web Speech API.
 * - Remote and game-controller buttons are mapped onto the keys the web app listens for.
 */
public class MainActivity extends Activity {
    private static final String TAG = "LeoTV";
    private static final String APP_URL = "https://arthur-play-learn.vercel.app/?tv=1";

    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private volatile String ttsStatus = "starting";
    private final List<String> enginesToTry = new ArrayList<>();
    private final List<String[]> pending = new ArrayList<>(); // speech asked for before the engine was ready

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#ffc93c"));
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);
        hideSystemUi();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // progress, PIN and settings live in localStorage
        s.setMediaPlaybackRequiresUserGesture(false); // music and videos can start straight away
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " LeoTV/1");

        web.addJavascriptInterface(new LeoBridge(), "LeoNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    Log.w(TAG, "Page failed to load: " + error.getDescription());
                    view.loadData(offlinePage(), "text/html", "utf-8");
                }
            }
        });

        startVoice(null); // device default engine first; others are tried if it fails

        web.loadUrl(APP_URL);
        web.requestFocus();
    }

    /** Start text-to-speech with the given engine (null = default); on failure move on to the next installed engine. */
    private void startVoice(String engine) {
        ttsStatus = "starting" + (engine == null ? "" : " (" + engine + ")");
        TextToSpeech.OnInitListener onInit = status -> {
            if (status != TextToSpeech.SUCCESS) {
                Log.w(TAG, "TTS engine " + engine + " failed: " + status);
                if (engine == null && tts != null) {
                    for (TextToSpeech.EngineInfo e : tts.getEngines()) enginesToTry.add(e.name);
                }
                if (tts != null) tts.shutdown();
                if (!enginesToTry.isEmpty()) { startVoice(enginesToTry.remove(0)); return; }
                ttsStatus = "not available on this TV (no working speech engine)";
                return;
            }
            String langUsed = "default";
            for (Locale l : new Locale[]{Locale.UK, Locale.US, Locale.ENGLISH}) {
                int r = tts.setLanguage(l);
                if (r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED) { langUsed = l.toString(); break; }
            }
            // Play through the normal media volume, not the accessibility stream.
            tts.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            tts.setPitch(1.15f);
            tts.setSpeechRate(0.9f);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { notifyDone(id); }
                @Override public void onError(String id) { Log.w(TAG, "utterance error " + id); notifyDone(id); }
            });
            String name = tts.getDefaultEngine();
            ttsStatus = "ready (" + (engine != null ? engine : name) + ", " + langUsed + ")";
            ttsReady = true;
            synchronized (pending) {
                for (String[] p : pending) say(p[0], p[1], true);
                pending.clear();
            }
        };
        tts = engine == null ? new TextToSpeech(this, onInit) : new TextToSpeech(this, onInit, engine);
    }

    private void say(String text, String id, boolean queue) {
        String clipped = text.length() > 400 ? text.substring(0, 400) : text;
        int mode = queue ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH;
        int result = tts.speak(clipped, mode, null, id);
        if (result != TextToSpeech.SUCCESS) {
            Log.w(TAG, "speak() failed with " + result);
            ttsStatus = "engine refused to speak (" + result + ")";
            notifyDone(id);
        }
    }

    private void notifyDone(String id) {
        String safeId = id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", "");
        runOnUiThread(() -> web.evaluateJavascript(
                "window.__leoSpeechDone && window.__leoSpeechDone('" + safeId + "')", null));
    }

    /** Methods callable from the page as window.LeoNative.*. Inputs are only spoken, never executed. */
    private class LeoBridge {
        @JavascriptInterface
        public boolean canSpeak() { return ttsReady; }

        /** Plain-English voice status for the grown-ups screen. */
        @JavascriptInterface
        public String status() { return ttsStatus; }

        @JavascriptInterface
        public void speak(String text, String id, boolean queue) {
            if (text == null) { notifyDone(id); return; }
            if (!ttsReady) {
                // Engine still starting: keep only the latest line so it is spoken as soon as it's ready.
                synchronized (pending) { pending.clear(); pending.add(new String[]{text, id}); }
                return;
            }
            say(text, id, queue);
        }

        @JavascriptInterface
        public void stop() { if (ttsReady) tts.stop(); }
    }

    /** Map controller buttons onto what the web app understands; send Back to the page first. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (code == KeyEvent.KEYCODE_BUTTON_A || code == KeyEvent.KEYCODE_BUTTON_X) {
            return super.dispatchKeyEvent(new KeyEvent(event.getAction(), KeyEvent.KEYCODE_ENTER));
        }
        if (code == KeyEvent.KEYCODE_BUTTON_B || code == KeyEvent.KEYCODE_BUTTON_Y) {
            if (event.getAction() == KeyEvent.ACTION_UP) {
                web.evaluateJavascript("window.__leoRepeat && window.__leoRepeat()", null);
            }
            return true;
        }
        if (code == KeyEvent.KEYCODE_BACK || code == KeyEvent.KEYCODE_BUTTON_START) {
            if (event.getAction() == KeyEvent.ACTION_UP) {
                // The page returns "exit" when it's already on its home screen.
                web.evaluateJavascript("window.__leoBack ? window.__leoBack() : 'exit'", result -> {
                    if ("\"exit\"".equals(result)) finish();
                });
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private void hideSystemUi() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private static String offlinePage() {
        return "<html><body style=\"margin:0;background:#ffc93c;font-family:sans-serif;display:flex;"
                + "align-items:center;justify-content:center;height:100vh;text-align:center;color:#2b2118\">"
                + "<div><h1 style=\"font-size:48px\">ARTHUR can't connect</h1>"
                + "<p style=\"font-size:24px\">Check the internet, then press Back and open ARTHUR again.</p></div>"
                + "</body></html>";
    }

    @Override protected void onResume() { super.onResume(); hideSystemUi(); web.onResume(); }
    @Override protected void onPause() { web.onPause(); if (ttsReady) tts.stop(); super.onPause(); }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
