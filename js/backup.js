import { exportAll, importAll } from "./db.js";
import { markClean } from "./dirty.js";

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportBackup() {
  const payload = await exportAll();
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(`tuka-marine-park-backup-${stamp}.json`, payload);
  markClean();
  return payload;
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.stores || typeof data.stores !== "object") {
          reject(new Error("File is not a Tuka Marine Park backup."));
          return;
        }
        resolve(data);
      } catch (err) {
        reject(new Error("Could not parse JSON backup."));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function restoreBackup(payload) {
  await importAll(payload);
}
