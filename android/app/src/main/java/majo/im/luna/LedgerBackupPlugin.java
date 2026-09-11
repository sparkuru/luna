package majo.im.luna;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/** Writes only an encrypted backup to a document explicitly chosen by the user. */
@CapacitorPlugin(name = "LedgerBackup")
public class LedgerBackupPlugin extends Plugin {
    private static final int MAX_ENVELOPE_BYTES = 12 * 1024 * 1024;
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile byte[] pending;

    @PluginMethod
    public void save(PluginCall call) {
        if (!busy.compareAndSet(false, true)) {
            call.reject("LUNA_ERROR:ledger-backup-failed");
            return;
        }
        try {
            String json = call.getString("json");
            if (json == null || json.isEmpty() || json.length() > MAX_ENVELOPE_BYTES) {
                throw new IllegalArgumentException();
            }
            pending = json.getBytes(StandardCharsets.UTF_8);
            if (pending.length > MAX_ENVELOPE_BYTES) throw new IllegalArgumentException();
            validateEnvelope(new JSONObject(json));
            // Capacitor serializes pending call data into Activity state. Keep the
            // potentially large ciphertext in memory, never in a Binder Bundle.
            call.getData().remove("json");
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, "luna-ledger-" + System.currentTimeMillis() + ".encrypted.json");
            getActivity().runOnUiThread(() -> {
                try {
                    startActivityForResult(call, intent, "documentChosen");
                } catch (RuntimeException ignored) {
                    clearPending();
                    call.reject("LUNA_ERROR:ledger-backup-failed");
                    getBridge().releaseCall(call);
                }
            });
        } catch (Exception ignored) {
            clearPending();
            call.getData().remove("json");
            call.reject("LUNA_ERROR:ledger-backup-failed");
            getBridge().releaseCall(call);
        }
    }

    @ActivityCallback
    private void documentChosen(PluginCall call, ActivityResult result) {
        if (call == null) {
            clearPending();
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK) {
            clearPending();
            call.reject("LUNA_ERROR:ledger-backup-cancelled");
            getBridge().releaseCall(call);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        getBridge().execute(() -> {
            try {
                if (pending == null || uri == null || !"content".equals(uri.getScheme())) {
                    throw new IllegalArgumentException();
                }
                try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                    if (stream == null) throw new IllegalStateException();
                    stream.write(pending);
                    stream.flush();
                }
                call.resolve();
            } catch (Exception ignored) {
                call.reject("LUNA_ERROR:ledger-backup-failed");
            } finally {
                clearPending();
                getBridge().releaseCall(call);
            }
        });
    }

    private void clearPending() {
        if (pending != null) Arrays.fill(pending, (byte) 0);
        pending = null;
        busy.set(false);
    }

    private static void validateEnvelope(JSONObject envelope) throws Exception {
        if (envelope.length() != 6 || !"luna-ledger-envelope".equals(envelope.getString("format"))
            || !exactNumber(envelope, "version", 1) || !exactNumber(envelope, "payloadSchemaVersion", 1)) {
            throw new IllegalArgumentException();
        }
        JSONObject kdf = envelope.getJSONObject("kdf");
        JSONObject cipher = envelope.getJSONObject("cipher");
        if (kdf.length() != 4 || !"PBKDF2".equals(kdf.getString("name"))
            || !"SHA-256".equals(kdf.getString("hash")) || !exactNumber(kdf, "iterations", 600000)
            || cipher.length() != 3 || !"AES-GCM".equals(cipher.getString("name"))
            || !exactNumber(cipher, "tagLength", 128)) throw new IllegalArgumentException();
        validateBase64(kdf.getString("salt"), 16, 16);
        validateBase64(cipher.getString("iv"), 12, 12);
        validateBase64(envelope.getString("ciphertext"), 16, 8 * 1024 * 1024 + 16);
    }

    private static boolean exactNumber(JSONObject object, String key, int expected) throws Exception {
        Object value = object.get(key);
        return value instanceof Number && ((Number) value).doubleValue() == expected;
    }

    private static void validateBase64(String encoded, int minimum, int maximum) {
        byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
        if (bytes.length < minimum || bytes.length > maximum
            || !Base64.encodeToString(bytes, Base64.NO_WRAP).equals(encoded)) {
            throw new IllegalArgumentException();
        }
    }
}
