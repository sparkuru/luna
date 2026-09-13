package majo.im.luna;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;

/**
 * Narrow Android image-input bridge. Content URIs stay inside this plugin;
 * JavaScript receives only short-lived handles and bounded base64 chunks.
 */
@CapacitorPlugin(name = "LedgerImageInput")
public class LedgerImageInputPlugin extends Plugin {
    private static final int MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
    private static final int MAX_BRIDGE_CHUNK_BYTES = 1024 * 1024;
    private static final int MAX_IMAGES = 9;
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private final Map<String, SelectedImage> selected = new HashMap<>();

    @PluginMethod
    public void selectImages(PluginCall call) {
        if (!busy.compareAndSet(false, true)) {
            call.reject("LUNA_ERROR:attachment-picker-busy");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
            "image/jpeg", "image/png", "image/webp"
        });
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        getActivity().runOnUiThread(() -> {
            try {
                startActivityForResult(call, intent, "imagesSelected");
            } catch (RuntimeException ignored) {
                clearSelectedImages();
                call.reject("LUNA_ERROR:attachment-picker-failed");
                getBridge().releaseCall(call);
            }
        });
    }

    @ActivityCallback
    private void imagesSelected(PluginCall call, ActivityResult result) {
        if (call == null) {
            clearSelectedImages();
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK) {
            clearSelectedImages();
            call.reject("LUNA_ERROR:attachment-picker-cancelled");
            getBridge().releaseCall(call);
            return;
        }
        List<Uri> uris = selectedUris(result.getData());
        getBridge().execute(() -> {
            Map<String, SelectedImage> next = new HashMap<>();
            try {
                if (uris.isEmpty() || uris.size() > MAX_IMAGES)
                    throw new IllegalArgumentException();
                List<String> handles = new ArrayList<>();
                for (Uri uri : uris) {
                    if (uri == null || !"content".equals(uri.getScheme()))
                        throw new IllegalArgumentException();
                    String mime = getContext().getContentResolver().getType(uri);
                    if (!isSupportedMime(mime)) throw new IllegalArgumentException();
                    Long size = documentSize(uri);
                    if (size != null && (size < 1 || size > MAX_SOURCE_IMAGE_BYTES))
                        throw new IllegalArgumentException();
                    InputStream stream = getContext().getContentResolver().openInputStream(uri);
                    if (stream == null) throw new IllegalStateException();
                    String handle = UUID.randomUUID().toString();
                    next.put(handle, new SelectedImage(stream, mime, size));
                    handles.add(handle);
                }
                JSONArray images = new JSONArray();
                for (String handle : handles) {
                    SelectedImage item = next.get(handle);
                    if (item == null) throw new IllegalStateException();
                    JSObject image = new JSObject();
                    image.put("handle", handle);
                    image.put("mime", item.mime);
                    if (item.size == null)
                        image.put("size", org.json.JSONObject.NULL);
                    else
                        image.put("size", item.size);
                    images.put(image);
                }
                synchronized (this) {
                    selected.putAll(next);
                }
                next.clear();
                JSObject response = new JSObject();
                response.put("images", images);
                call.resolve(response);
            } catch (Exception ignored) {
                closeUnpublishedImages(next.values());
                clearSelectedImages();
                call.reject("LUNA_ERROR:attachment-picker-failed");
            } finally {
                getBridge().releaseCall(call);
            }
        });
    }

    @PluginMethod
    public void readSelectedImageChunk(PluginCall call) {
        String handle = call.getString("handle");
        final int sequence;
        try {
            sequence = call.getInt("sequence");
        } catch (Exception ignored) {
            call.reject("LUNA_ERROR:attachment-picker-failed");
            return;
        }
        getBridge().execute(() -> {
            byte[] buffer = null;
            try {
                synchronized (this) {
                    SelectedImage image = selected.get(handle);
                    if (image == null || sequence < 0)
                        throw new IllegalArgumentException();
                    if (sequence == image.nextSequence - 1 && image.lastChunk != null) {
                        resolveChunk(call, image);
                        return;
                    }
                    if (sequence != image.nextSequence)
                        throw new IllegalArgumentException();
                    buffer = new byte[MAX_BRIDGE_CHUNK_BYTES];
                    int count = 0;
                    boolean eof = false;
                    if (image.pendingByte >= 0) {
                        buffer[count++] = (byte) image.pendingByte;
                        image.pendingByte = -1;
                    }
                    while (count < buffer.length) {
                        int read = image.stream.read(buffer, count, buffer.length - count);
                        if (read < 0) {
                            eof = true;
                            break;
                        }
                        if (read == 0) continue;
                        count += read;
                    }
                    if (!eof && count == buffer.length) {
                        int lookahead = image.stream.read();
                        if (lookahead < 0) eof = true;
                        else image.pendingByte = lookahead;
                    }
                    long nextBytes = image.receivedBytes + count;
                    if (count == 0 || nextBytes > MAX_SOURCE_IMAGE_BYTES
                            || (image.size != null && nextBytes > image.size)
                            || (eof && image.size != null && nextBytes != image.size))
                        throw new IllegalArgumentException();
                    image.receivedBytes = nextBytes;
                    if (image.lastChunk != null) zero(image.lastChunk);
                    image.lastChunk = copyOf(buffer, count);
                    image.lastEof = eof;
                    image.nextSequence += 1;
                    resolveChunk(call, image);
                }
            } catch (Exception ignored) {
                clearSelectedImages();
                call.reject("LUNA_ERROR:attachment-picker-failed");
            } finally {
                if (buffer != null) zero(buffer);
                getBridge().releaseCall(call);
            }
        });
    }

    @PluginMethod
    public void closeSelectedImage(PluginCall call) {
        String handle = call.getString("handle");
        getBridge().execute(() -> {
            try {
                synchronized (this) {
                    SelectedImage image = selected.remove(handle);
                    if (image != null) image.close();
                    if (selected.isEmpty()) busy.set(false);
                }
                call.resolve();
            } catch (Exception ignored) {
                clearSelectedImages();
                call.reject("LUNA_ERROR:attachment-picker-failed");
            } finally {
                getBridge().releaseCall(call);
            }
        });
    }

    private void resolveChunk(PluginCall call, SelectedImage image) {
        JSObject response = new JSObject();
        response.put("base64", Base64.encodeToString(image.lastChunk, Base64.NO_WRAP));
        response.put("eof", image.lastEof);
        response.put("receivedBytes", image.receivedBytes);
        call.resolve(response);
    }

    private void clearSelectedImages() {
        synchronized (this) {
            closeUnpublishedImages(selected.values());
            selected.clear();
            busy.set(false);
        }
    }

    static void closeUnpublishedImages(Iterable<SelectedImage> images) {
        for (SelectedImage image : images) image.close();
    }

    private static List<Uri> selectedUris(Intent data) {
        List<Uri> uris = new ArrayList<>();
        if (data == null) return uris;
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int index = 0; index < clip.getItemCount(); index++)
                uris.add(clip.getItemAt(index).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        return uris;
    }

    private Long documentSize(Uri uri) {
        try (android.database.Cursor cursor = getContext().getContentResolver().query(
                uri,
                new String[] { OpenableColumns.SIZE },
                null,
                null,
                null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) {
                long size = cursor.getLong(0);
                return size >= 0 ? size : null;
            }
        } catch (Exception ignored) {
            /* Providers may not expose a trustworthy size; the stream is authoritative. */
        }
        return null;
    }

    private static boolean isSupportedMime(String mime) {
        return "image/jpeg".equals(mime) || "image/png".equals(mime)
                || "image/webp".equals(mime);
    }

    private static byte[] copyOf(byte[] source, int length) {
        byte[] copy = new byte[length];
        System.arraycopy(source, 0, copy, 0, length);
        return copy;
    }

    private static void zero(byte[] bytes) {
        java.util.Arrays.fill(bytes, (byte) 0);
    }

    static final class SelectedImage {
        private final InputStream stream;
        private final String mime;
        private final Long size;
        private byte[] lastChunk;
        private boolean lastEof;
        private int nextSequence;
        private long receivedBytes;
        private int pendingByte = -1;

        SelectedImage(InputStream stream, String mime, Long size) {
            this.stream = stream;
            this.mime = mime;
            this.size = size;
        }

        private void close() {
            try {
                stream.close();
            } catch (Exception ignored) {
                /* Release the opaque handle even when a provider close fails. */
            }
            if (lastChunk != null) zero(lastChunk);
            lastChunk = null;
            pendingByte = -1;
        }
    }
}
