let dirty = false;
let lastExportAt = null;

export function markDirty() {
  dirty = true;
}

export function markClean() {
  dirty = false;
  lastExportAt = new Date().toISOString();
}

export function isDirty() {
  return dirty;
}

export function getLastExportAt() {
  return lastExportAt;
}
