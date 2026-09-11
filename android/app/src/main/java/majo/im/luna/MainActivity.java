package majo.im.luna;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.net.Uri;
import android.content.pm.ApplicationInfo;
import android.webkit.WebView;
import android.webkit.WebSettings;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LedgerBackupPlugin.class);
        super.onCreate(savedInstanceState);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0
                && getBridge() != null) {
            getBridge().getWebView().getSettings().setMixedContentMode(
                    WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            private boolean pending = false;

            @Override
            public void handleOnBackPressed() {
                if (pending) return;
                WebView view = getBridge() == null ? null : getBridge().getWebView();
                Uri origin = view == null || view.getUrl() == null ? null : Uri.parse(view.getUrl());
                if (origin == null || !"https".equals(origin.getScheme())
                        || !"localhost".equals(origin.getHost())
                        || (origin.getPort() != -1 && origin.getPort() != 443)) {
                    nativeBack();
                    return;
                }
                pending = true;
                // Only a fixed cancellable event crosses the native/renderer boundary.
                view.evaluateJavascript(
                    "!window.dispatchEvent(new CustomEvent('luna:navigate-back',{cancelable:true}))",
                    handled -> {
                        pending = false;
                        if (!"true".equals(handled)) nativeBack();
                    }
                );
            }

            private void nativeBack() {
                setEnabled(false);
                try {
                    getOnBackPressedDispatcher().onBackPressed();
                } finally {
                    setEnabled(true);
                }
            }
        });
    }
}
