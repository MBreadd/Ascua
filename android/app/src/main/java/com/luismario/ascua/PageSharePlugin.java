package com.luismario.ascua;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.UUID;

@CapacitorPlugin(name = "PageShare")
public class PageSharePlugin extends Plugin {
    private static final String CACHE_FOLDER = "shared_pages";
    private static final String DEFAULT_PACKAGE = "com.deepseek.chat";
    private final Object sessionLock = new Object();
    private FileOutputStream output;
    private File partialFile;
    private File pngFile;
    private String prompt;
    private String packageName;

    @Override
    public void load() {
        cleanupOldImages();
    }

    @PluginMethod
    public void begin(PluginCall call) {
        String requestedPrompt = call.getString("prompt");
        String requestedPackage = call.getString("packageName", DEFAULT_PACKAGE);
        Integer requestedPage = call.getInt("pageNumber", 1);
        if (requestedPrompt == null || requestedPrompt.trim().isEmpty()) {
            call.reject("El prompt está vacío.", "INVALID_PROMPT");
            return;
        }

        try {
            copyPrompt(requestedPrompt);
        } catch (Exception error) {
            call.reject("No se pudo copiar el prompt.", "CLIPBOARD_FAILED", error);
            return;
        }

        synchronized (sessionLock) {
            closeSession(true);
            try {
                File folder = cacheFolder();
                if (!folder.exists() && !folder.mkdirs()) {
                    throw new IOException("No se pudo crear la carpeta de caché.");
                }
                int page = Math.max(1, requestedPage == null ? 1 : requestedPage);
                String token = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
                String baseName = "ascua_page_" + page + "_" + System.currentTimeMillis() + "_" + token;
                partialFile = new File(folder, baseName + ".part");
                pngFile = new File(folder, baseName + ".png");
                output = new FileOutputStream(partialFile, false);
                prompt = requestedPrompt;
                packageName = requestedPackage;
            } catch (Exception error) {
                closeSession(true);
                call.reject("No se pudo preparar la caché.", "CACHE_WRITE_FAILED", error);
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void append(PluginCall call) {
        String encoded = call.getString("data");
        if (encoded == null || encoded.isEmpty()) {
            call.reject("El bloque de imagen está vacío.", "INVALID_IMAGE_CHUNK");
            return;
        }

        final byte[] bytes;
        try {
            bytes = Base64.decode(encoded, Base64.NO_WRAP);
        } catch (IllegalArgumentException error) {
            call.reject("El bloque de imagen no es válido.", "INVALID_IMAGE_CHUNK", error);
            return;
        }

        synchronized (sessionLock) {
            if (output == null) {
                call.reject("No hay una imagen en preparación.", "NO_ACTIVE_SHARE");
                return;
            }
            try {
                output.write(bytes);
            } catch (IOException error) {
                closeSession(true);
                call.reject("No se pudo escribir la imagen.", "CACHE_WRITE_FAILED", error);
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void finish(PluginCall call) {
        final File completedFile;
        final String completedPrompt;
        final String preferredPackage;
        synchronized (sessionLock) {
            if (output == null || partialFile == null || pngFile == null) {
                call.reject("No hay una imagen en preparación.", "NO_ACTIVE_SHARE");
                return;
            }
            try {
                output.flush();
                output.close();
                output = null;
                if (partialFile.length() == 0 || !partialFile.renameTo(pngFile)) {
                    throw new IOException("No se pudo completar el PNG.");
                }
                completedFile = pngFile;
                completedPrompt = prompt;
                preferredPackage = packageName;
                partialFile = null;
                pngFile = null;
                prompt = null;
                packageName = null;
            } catch (Exception error) {
                closeSession(true);
                call.reject("No se pudo completar la imagen.", "CACHE_WRITE_FAILED", error);
                return;
            }
        }
        shareOnMainThread(call, completedFile, completedPrompt, preferredPackage);
    }

    @PluginMethod
    public void abort(PluginCall call) {
        synchronized (sessionLock) {
            closeSession(true);
        }
        call.resolve();
    }

    private void shareOnMainThread(PluginCall call, File file, String text, String preferredPackage) {
        getActivity().runOnUiThread(() -> {
            try {
                Context context = getContext();
                Uri uri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    file
                );
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/png");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_TEXT, text);
                send.setClipData(ClipData.newUri(context.getContentResolver(), "Página de Ascua", uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                boolean openedDeepSeek = false;
                if (isInstalledAndEnabled(preferredPackage)) {
                    Intent direct = new Intent(send);
                    direct.setPackage(preferredPackage);
                    if (direct.resolveActivity(context.getPackageManager()) != null) {
                        getActivity().startActivity(direct);
                        openedDeepSeek = true;
                    }
                }
                if (!openedDeepSeek) {
                    Intent chooser = Intent.createChooser(send, "Compartir página");
                    chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    getActivity().startActivity(chooser);
                }

                JSObject result = new JSObject();
                result.put("destination", openedDeepSeek ? "deepseek" : "chooser");
                call.resolve(result);
            } catch (ActivityNotFoundException error) {
                call.reject("No hay una app disponible para compartir la imagen.", "NO_SHARE_TARGET", error);
            } catch (Exception error) {
                call.reject("No se pudo abrir la app de destino.", "SHARE_LAUNCH_FAILED", error);
            }
        });
    }

    private void copyPrompt(String text) {
        ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) {
            throw new IllegalStateException("Portapapeles no disponible.");
        }
        clipboard.setPrimaryClip(ClipData.newPlainText("Prompt de Ascua", text));
    }

    private boolean isInstalledAndEnabled(String candidate) {
        if (candidate == null || candidate.trim().isEmpty()) {
            return false;
        }
        try {
            PackageManager manager = getContext().getPackageManager();
            ApplicationInfo info;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                info = manager.getApplicationInfo(candidate, PackageManager.ApplicationInfoFlags.of(0));
            } else {
                info = manager.getApplicationInfo(candidate, 0);
            }
            return info.enabled;
        } catch (PackageManager.NameNotFoundException error) {
            return false;
        }
    }

    private File cacheFolder() {
        return new File(getContext().getCacheDir(), CACHE_FOLDER);
    }

    private void cleanupOldImages() {
        File folder = cacheFolder();
        File[] files = folder.listFiles();
        if (files == null) {
            return;
        }
        for (File file : files) {
            String name = file.getName();
            if (file.isFile() && name.startsWith("ascua_page_") && (name.endsWith(".png") || name.endsWith(".part"))) {
                file.delete();
            }
        }
    }

    private void closeSession(boolean deleteFiles) {
        if (output != null) {
            try {
                output.close();
            } catch (IOException ignored) {}
        }
        output = null;
        if (deleteFiles) {
            if (partialFile != null) {
                partialFile.delete();
            }
            if (pngFile != null) {
                pngFile.delete();
            }
        }
        partialFile = null;
        pngFile = null;
        prompt = null;
        packageName = null;
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (sessionLock) {
            closeSession(true);
        }
    }
}
