package com.luismario.ascua;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import android.content.Context;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class PageShareInstrumentedTest {
    @Test
    public void fileProviderOnlyExposesTheSharedPagesCacheFolder() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File folder = new File(context.getCacheDir(), "shared_pages");
        File allowed = new File(folder, "ascua_page_test.png");
        File blocked = new File(context.getCacheDir(), "outside_shared_pages.png");
        folder.mkdirs();
        try (FileOutputStream stream = new FileOutputStream(allowed)) {
            stream.write(new byte[] { (byte) 0x89, 0x50, 0x4e, 0x47 });
        }
        try (FileOutputStream stream = new FileOutputStream(blocked)) {
            stream.write(1);
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                allowed
            );
            assertEquals("content", uri.getScheme());
            assertThrows(IllegalArgumentException.class, () -> FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                blocked
            ));
        } finally {
            allowed.delete();
            blocked.delete();
        }
    }
}
