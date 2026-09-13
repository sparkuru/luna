package majo.im.luna;

import android.app.Activity;
import android.database.Cursor;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/** Writes only an encrypted backup to a document explicitly chosen by the user. */
@CapacitorPlugin(name = "LedgerBackup")
public class LedgerBackupPlugin extends Plugin {
    private static final int MAX_ENVELOPE_BYTES = 12 * 1024 * 1024;
    private static final int MAX_COMPLETE_BACKUP_BYTES = 544 * 1024 * 1024;
    private static final int MAX_BRIDGE_CHUNK_BYTES = 1024 * 1024;
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile byte[] pending;
    private volatile OutputStream completeStream;
    private volatile Uri completeUri;
    private volatile String completeHandle;
    private volatile byte[] lastCompleteChunk;
    private volatile int nextCompleteSequence;
    private volatile long completeBytes;
    private volatile InputStream openStream;
    private volatile Uri openUri;
    private volatile String openHandle;
    private volatile byte[] lastOpenChunk;
    private volatile boolean lastOpenEof;
    private volatile int nextOpenSequence;
    private volatile long openBytes;
    private volatile int pendingOpenByte = -1;

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

    /** Starts an SAF-backed complete .luna-backup stream without moving the file through a Bundle. */
    @PluginMethod
    public void beginSave(PluginCall call) {
        if (!busy.compareAndSet(false, true)) {
            call.reject("LUNA_ERROR:ledger-backup-failed");
            return;
        }
        try {
            String fileName = call.getString("fileName");
            if (fileName == null || !fileName.matches("[A-Za-z0-9._-]{1,96}"))
                throw new IllegalArgumentException();
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/octet-stream");
            intent.putExtra(Intent.EXTRA_TITLE, fileName);
            getActivity().runOnUiThread(() -> {
                try {
                    startActivityForResult(call, intent, "completeDocumentChosen");
                } catch (RuntimeException ignored) {
                    clearComplete(false);
                    call.reject("LUNA_ERROR:ledger-backup-failed");
                    getBridge().releaseCall(call);
                }
            });
        } catch (Exception ignored) {
            clearComplete(false);
            call.reject("LUNA_ERROR:ledger-backup-failed");
            getBridge().releaseCall(call);
        }
    }

    @ActivityCallback
    private void completeDocumentChosen(PluginCall call, ActivityResult result) {
        if (call == null) {
            clearComplete(false);
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK) {
            clearComplete(false);
            call.reject("LUNA_ERROR:ledger-backup-cancelled");
            getBridge().releaseCall(call);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        getBridge().execute(() -> {
            try {
                if (uri == null || !"content".equals(uri.getScheme()))
                    throw new IllegalArgumentException();
                OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "w");
                if (stream == null) throw new IllegalStateException();
                completeStream = stream;
                completeUri = uri;
                completeHandle = java.util.UUID.randomUUID().toString();
                lastCompleteChunk = null;
                nextCompleteSequence = 0;
                completeBytes = 0;
                JSObject response = new JSObject();
                response.put("handle", completeHandle);
                call.resolve(response);
            } catch (Exception ignored) {
                clearComplete(true);
                call.reject("LUNA_ERROR:ledger-backup-failed");
            } finally {
                getBridge().releaseCall(call);
            }
        });
    }

    @PluginMethod
    public void writeChunk(PluginCall call) {
        final String handle = call.getString("handle");
        final String encoded = call.getString("base64");
        final int sequence;
        try {
            sequence = call.getInt("sequence");
        } catch (Exception ignored) {
            call.reject("LUNA_ERROR:ledger-backup-failed");
            return;
        }
        getBridge().execute(() -> {
            try {
                byte[] decoded = decodeChunk(encoded);
                synchronized (this) {
                    if (completeStream == null || completeHandle == null || !completeHandle.equals(handle))
                        throw new IllegalStateException();
                    if (sequence == nextCompleteSequence - 1 && lastCompleteChunk != null
                        && Arrays.equals(lastCompleteChunk, decoded)) {
                        resolveChunk(call);
                        Arrays.fill(decoded, (byte) 0);
                        return;
                    }
                    if (sequence != nextCompleteSequence) throw new IllegalArgumentException();
                    if (completeBytes + decoded.length > MAX_COMPLETE_BACKUP_BYTES)
                        throw new IllegalArgumentException();
                    completeStream.write(decoded);
                    completeBytes += decoded.length;
                    if (lastCompleteChunk != null) Arrays.fill(lastCompleteChunk, (byte) 0);
                    lastCompleteChunk = decoded.clone();
                    nextCompleteSequence += 1;
                    resolveChunk(call);
                }
            } catch (Exception ignored) {
                clearComplete(true);
                call.reject("LUNA_ERROR:ledger-backup-failed");
            } finally {
                getBridge().releaseCall(call);
            }
        });
    }

    @PluginMethod
    public void finishSave(PluginCall call) {
        finishComplete(call, false);
    }

    @PluginMethod
    public void cancelSave(PluginCall call) {
        finishComplete(call, true);
    }

    private void finishComplete(PluginCall call, boolean cancel) {
        String handle = call.getString("handle");
        getBridge().execute(() -> {
            try {
                synchronized (this) {
                    if (completeStream == null || completeHandle == null || !completeHandle.equals(handle))
                        throw new IllegalStateException();
                    clearComplete(cancel);
                }
                if (cancel) call.resolve();
                else call.resolve();
            } catch (Exception ignored) {
                clearComplete(true);
                call.reject("LUNA_ERROR:ledger-backup-failed");
            } finally {
                getBridge().releaseCall(call);
            }
        });
    }

    /** Opens a user-selected encrypted backup for bounded, sequential reads. */
    @PluginMethod
    public void beginOpen(PluginCall call) {
        if (!busy.compareAndSet(false, true)) {
            call.reject("LUNA_ERROR:ledger-backup-failed");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/octet-stream");
        getActivity().runOnUiThread(() -> {
            try {
                startActivityForResult(call, intent, "openDocumentChosen");
            } catch (RuntimeException ignored) {
                clearOpen();
                call.reject("LUNA_ERROR:ledger-backup-failed");
                getBridge().releaseCall(call);
            }
        });
    }

    @ActivityCallback
    private void openDocumentChosen(PluginCall call, ActivityResult result) {
        if (call == null) {
            clearOpen();
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK) {
            clearOpen();
            call.reject("LUNA_ERROR:ledger-backup-cancelled");
            getBridge().releaseCall(call);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        getBridge().execute(() -> {
            try {
                if (uri == null || !"content".equals(uri.getScheme()))
                    throw new IllegalArgumentException();
                InputStream stream = getContext().getContentResolver().openInputStream(uri);
                if (stream == null) throw new IllegalStateException();
                openStream = stream;
                openUri = uri;
                openHandle = java.util.UUID.randomUUID().toString();
                lastOpenChunk = null;
                lastOpenEof = false;
                nextOpenSequence = 0;
                openBytes = 0;
                pendingOpenByte = -1;
                JSObject response = new JSObject();
                response.put("handle", openHandle);
                Long size = documentSize(uri);
                if (size == null) response.put("size", JSONObject.NULL);
                else response.put("size", size);
                call.resolve(response);
            } catch (Exception ignored) {
                clearOpen();
                call.reject("LUNA_ERROR:ledger-backup-failed");
            } finally {
                getBridge().releaseCall(call);
            }
        });
    }

    @PluginMethod
    public void readChunk(PluginCall call) {
        final String handle = call.getString("handle");
        final int sequence;
        try {
            sequence = call.getInt("sequence");
        } catch (Exception ignored) {
            call.reject("LUNA_ERROR:ledger-backup-failed");
            return;
        }
        getBridge().execute(() -> {
            try {
                synchronized (this) {
                    if (openStream == null || openHandle == null || !openHandle.equals(handle))
                        throw new IllegalStateException();
                    if (sequence == nextOpenSequence - 1 && lastOpenChunk != null) {
                        resolveReadChunk(call, lastOpenChunk, lastOpenEof);
                        return;
                    }
                    if (sequence != nextOpenSequence) throw new IllegalArgumentException();
                    byte[] buffer = new byte[MAX_BRIDGE_CHUNK_BYTES];
                    int count = 0;
                    boolean eof = false;
                    if (pendingOpenByte >= 0) {
                        buffer[count++] = (byte) pendingOpenByte;
                        pendingOpenByte = -1;
                    }
                    while (count < buffer.length) {
                        int read = openStream.read(buffer, count, buffer.length - count);
                        if (read < 0) {
                            eof = true;
                            break;
                        }
                        if (read == 0) continue;
                        count += read;
                    }
                    if (!eof && count == buffer.length) {
                        int lookahead = openStream.read();
                        if (lookahead < 0) eof = true;
                        else pendingOpenByte = lookahead;
                    }
                    if (openBytes + count > MAX_COMPLETE_BACKUP_BYTES)
                        throw new IllegalArgumentException();
                    openBytes += count;
                    if (lastOpenChunk != null) Arrays.fill(lastOpenChunk, (byte) 0);
                    lastOpenChunk = Arrays.copyOf(buffer, count);
                    lastOpenEof = eof;
                    nextOpenSequence += 1;
                    resolveReadChunk(call, lastOpenChunk, eof);
                    Arrays.fill(buffer, (byte) 0);
                }
            } catch (Exception ignored) {
                clearOpen();
                call.reject("LUNA_ERROR:ledger-backup-failed");
            } finally {
                getBridge().releaseCall(call);
            }
        });
    }

    @PluginMethod
    public void closeOpen(PluginCall call) {
        final String handle = call.getString("handle");
        getBridge().execute(() -> {
            try {
                synchronized (this) {
                    if (openStream == null || openHandle == null || !openHandle.equals(handle))
                        throw new IllegalStateException();
                    clearOpen();
                }
                call.resolve();
            } catch (Exception ignored) {
                clearOpen();
                call.reject("LUNA_ERROR:ledger-backup-failed");
            } finally {
                getBridge().releaseCall(call);
            }
        });
    }

    private void resolveReadChunk(PluginCall call, byte[] bytes, boolean eof) {
        JSObject response = new JSObject();
        response.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
        response.put("eof", eof);
        response.put("receivedBytes", openBytes);
        call.resolve(response);
    }

    private Long documentSize(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(
                uri,
                new String[] { OpenableColumns.SIZE },
                null,
                null,
                null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) {
                long size = cursor.getLong(0);
                if (size >= 0 && size <= MAX_COMPLETE_BACKUP_BYTES) return size;
            }
        } catch (Exception ignored) {
            /* A provider may not expose a trustworthy size; the stream is authoritative. */
        }
        return null;
    }

    private void clearOpen() {
        if (openStream != null) {
            try {
                openStream.close();
            } catch (Exception ignored) {
                /* Release the handle even when the provider close fails. */
            }
        }
        if (lastOpenChunk != null) Arrays.fill(lastOpenChunk, (byte) 0);
        openStream = null;
        openUri = null;
        openHandle = null;
        lastOpenChunk = null;
        lastOpenEof = false;
        nextOpenSequence = 0;
        openBytes = 0;
        pendingOpenByte = -1;
        busy.set(false);
    }

    private void resolveChunk(PluginCall call) {
        JSObject response = new JSObject();
        response.put("receivedBytes", completeBytes);
        call.resolve(response);
    }

    private static byte[] decodeChunk(String encoded) {
        if (encoded == null || encoded.isEmpty()
            || encoded.length() > ((MAX_BRIDGE_CHUNK_BYTES + 2) / 3) * 4 + 4)
            throw new IllegalArgumentException();
        byte[] decoded = Base64.decode(encoded, Base64.DEFAULT);
        if (decoded.length == 0 || decoded.length > MAX_BRIDGE_CHUNK_BYTES
            || !Base64.encodeToString(decoded, Base64.NO_WRAP).equals(encoded))
            throw new IllegalArgumentException();
        return decoded;
    }

    private void clearComplete(boolean deleteTarget) {
        if (completeStream != null) {
            try {
                if (!deleteTarget) completeStream.flush();
                completeStream.close();
            } catch (Exception ignored) {
                /* The caller receives the bounded failure below. */
            }
        }
        if (deleteTarget && completeUri != null) {
            try {
                DocumentsContract.deleteDocument(getContext().getContentResolver(), completeUri);
            } catch (Exception ignored) {
                /* Some providers do not allow deletion; a missing footer keeps the file unusable. */
            }
        }
        if (lastCompleteChunk != null) Arrays.fill(lastCompleteChunk, (byte) 0);
        completeStream = null;
        completeUri = null;
        completeHandle = null;
        lastCompleteChunk = null;
        nextCompleteSequence = 0;
        completeBytes = 0;
        busy.set(false);
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
