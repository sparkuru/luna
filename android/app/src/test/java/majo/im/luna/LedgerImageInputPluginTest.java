package majo.im.luna;

import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.util.List;
import org.junit.Test;

public final class LedgerImageInputPluginTest {
    @Test
    public void laterSelectionValidationFailureClosesEveryUnpublishedStream() {
        TrackingStream first = new TrackingStream();
        TrackingStream second = new TrackingStream();
        List<LedgerImageInputPlugin.SelectedImage> unpublished = List.of(
            new LedgerImageInputPlugin.SelectedImage(first, "image/png", 1L),
            new LedgerImageInputPlugin.SelectedImage(second, "image/png", 1L)
        );

        try {
            // Represents a later provider item failing before the local set is published.
            throw new IllegalArgumentException("unsupported provider item");
        } catch (IllegalArgumentException ignored) {
            LedgerImageInputPlugin.closeUnpublishedImages(unpublished);
        }

        assertTrue(first.closed);
        assertTrue(second.closed);
    }

    private static final class TrackingStream extends ByteArrayInputStream {
        private boolean closed;

        private TrackingStream() {
            super(new byte[] { 1 });
        }

        @Override
        public void close() {
            closed = true;
        }
    }
}
