import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import {
  BackupError,
  BackupPayload,
  buildBackupFilename,
  serializeBackup,
  validateBackupPayload,
} from "@/src/lib/backupData";

/**
 * The native half of Settings → Data: writes the backup JSON, hands it to the
 * Android share sheet (save to Files, Gmail, Drive…), and reads a user-picked
 * backup back in. All payload validation lives in the pure backupData.ts —
 * this module only moves bytes.
 */

/** Files/Directories API (expo-file-system ≥ 54). Missing on very old SDKs. */
const hasNewFsApi = typeof (FileSystem as Record<string, unknown>).File === "function";
const hasNewDirApi = typeof (FileSystem as Record<string, unknown>).Directory === "function";
const hasLegacyApi =
  typeof (FileSystem as unknown as { documentDirectory?: unknown }).documentDirectory ===
    "string" &&
  typeof (FileSystem as unknown as { writeAsStringAsync?: unknown }).writeAsStringAsync ===
    "function";

/**
 * Export the payload as a pretty-printed JSON file via the Android share
 * sheet. Throws BackupError with a user-presentable message on failure.
 */
export async function exportBackup(payload: BackupPayload): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new BackupError("Sharing is not available on this device.");
  }

  const filename = buildBackupFilename(new Date());
  const json = serializeBackup(payload);

  try {
    if (hasNewFsApi && hasNewDirApi) {
      const cacheDir = new FileSystem.Directory(FileSystem.Paths.cache);
      cacheDir.create({ idempotent: true, intermediates: true });
      const file = new FileSystem.File(cacheDir, filename);
      file.write(json);
      try {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/json",
          dialogTitle: "Save your MacroMax backup",
          UTI: "public.json",
        });
      } finally {
        // Best-effort cache cleanup; the share sheet has its own copy by now.
        try {
          if (file.exists) file.delete();
        } catch {
          // Non-fatal: cache files are swept by the OS anyway.
        }
      }
      return;
    }

    if (hasLegacyApi) {
      const uri = `${(FileSystem as unknown as { documentDirectory: string }).documentDirectory}${filename}`;
      await (
        FileSystem as unknown as {
          writeAsStringAsync: (uri: string, data: string, o?: object) => Promise<void>;
        }
      ).writeAsStringAsync(uri, json, { encoding: "utf8" });
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        dialogTitle: "Save your MacroMax backup",
        UTI: "public.json",
      });
      return;
    }

    throw new BackupError("File storage is unavailable on this device.");
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError(
      error instanceof Error ? `Could not export your backup: ${error.message}` : "Export failed."
    );
  }
}

export interface PickedBackup {
  /** Validated payload, ready for restoreAllData(). */
  payload: BackupPayload;
  /** Chosen file name, for the confirmation dialog. */
  filename: string;
}

/**
 * Opens the Android document picker, reads the chosen file and validates it.
 * Returns null when the user cancels the picker.
 */
export async function pickBackupFile(): Promise<PickedBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const filename = asset.name ?? "backup.json";

  let text: string;
  try {
    if (hasNewFsApi) {
      const file = new FileSystem.File(asset.uri);
      text = await file.text();
    } else if (hasLegacyApi) {
      text = await (
        FileSystem as unknown as { readAsStringAsync: (uri: string, o?: object) => Promise<string> }
      ).readAsStringAsync(asset.uri, { encoding: "utf8" });
    } else {
      throw new BackupError("File storage is unavailable on this device.");
    }
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError("Could not read that file.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError("That file is not valid JSON.");
  }

  return { payload: validateBackupPayload(parsed), filename };
}
