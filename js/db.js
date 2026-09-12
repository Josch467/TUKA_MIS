import { sha256Hex } from "./hash.js";
import { markDirty } from "./dirty.js";
import { isTentUnit } from "./pricing.js";

export const DB_NAME = "TukaMarinePark";
export const DB_VERSION = 1;

const STORES = {
  users: { keyPath: "id", autoIncrement: true, indexes: [["username", "username", { unique: true }]] },
  reservations: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      ["reservationDate", "reservationDate"],
      ["status", "status"],
      ["reservationNo", "reservationNo", { unique: true }],
    ],
  },
  units: { keyPath: "id", autoIncrement: true },
  reservationUnits: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      ["reservationId", "reservationId"],
      ["unitId", "unitId"],
    ],
  },
  guestCounts: { keyPath: "reservationId", autoIncrement: false },
  rates: { keyPath: "id", autoIncrement: true, indexes: [["stayType", "stayType"]] },
  billing: { keyPath: "reservationId", autoIncrement: false },
  transactions: {
    keyPath: "id",
    autoIncrement: true,
    indexes: [
      ["reservationId", "reservationId"],
      ["transactionDate", "transactionDate"],
    ],
  },
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        let store;
        if (db.objectStoreNames.contains(name)) {
          store = req.transaction.objectStore(name);
        } else {
          store = db.createObjectStore(name, {
            keyPath: def.keyPath,
            autoIncrement: Boolean(def.autoIncrement),
          });
        }
        for (const [idxName, key, opts] of def.indexes || []) {
          if (!store.indexNames.contains(idxName)) {
            store.createIndex(idxName, key, opts || {});
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, fn) {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = await fn(store, tx);
  await txDone(tx);
  return result;
}

function repo(storeName) {
  return {
    async get(id) {
      return withStore(storeName, "readonly", (s) => reqToPromise(s.get(id)));
    },
    async getAll() {
      return withStore(storeName, "readonly", (s) => reqToPromise(s.getAll()));
    },
    async add(record) {
      const id = await withStore(storeName, "readwrite", (s) => reqToPromise(s.add(record)));
      markDirty();
      return id;
    },
    async put(record) {
      const id = await withStore(storeName, "readwrite", (s) => reqToPromise(s.put(record)));
      markDirty();
      return id;
    },
    async delete(id) {
      await withStore(storeName, "readwrite", (s) => reqToPromise(s.delete(id)));
      markDirty();
    },
    async byIndex(indexName, value) {
      return withStore(storeName, "readonly", (s) =>
        reqToPromise(s.index(indexName).getAll(value))
      );
    },
  };
}

export const users = repo("users");
export const reservations = repo("reservations");
export const units = repo("units");
export const reservationUnits = repo("reservationUnits");
export const guestCounts = repo("guestCounts");
export const rates = repo("rates");
export const billing = repo("billing");
export const transactions = repo("transactions");

export async function getUserByUsername(username) {
  const all = await users.getAll();
  return all.find((u) => u.username.toLowerCase() === String(username).toLowerCase()) || null;
}

const DEFAULT_RATES = [
  { stayType: "Day Tour", category: "Children", price: 50 },
  { stayType: "Day Tour", category: "Adolescent", price: 80 },
  { stayType: "Day Tour", category: "Adult", price: 150 },
  { stayType: "Day Tour", category: "Senior_PWD", price: 75 },
  { stayType: "Overnight", category: "Children", price: 80 },
  { stayType: "Overnight", category: "Adolescent", price: 120 },
  { stayType: "Overnight", category: "Adult", price: 250 },
  { stayType: "Overnight", category: "Senior_PWD", price: 125 },
];

const DEFAULT_UNITS = [
  { unitName: "Cottage A", stayType: "Day Tour", rate: 500, isActive: true },
  { unitName: "Cottage B", stayType: "Day Tour", rate: 500, isActive: true },
  { unitName: "Tent Space 1", stayType: "Day Tour", rate: 200, isActive: true },
  { unitName: "Tent Space 2", stayType: "Day Tour", rate: 200, isActive: true },
  { unitName: "Room 1", stayType: "Overnight", rate: 1800, isActive: true },
  { unitName: "Room 2", stayType: "Overnight", rate: 1800, isActive: true },
  { unitName: "Family Cottage", stayType: "Overnight", rate: 2500, isActive: true },
];

export async function ensureSeeded() {
  const passwordHash = await sha256Hex("admin");
  const db = await openDb();
  const tx = db.transaction(["users", "rates", "units"], "readwrite");
  const userStore = tx.objectStore("users");
  const rateStore = tx.objectStore("rates");
  const unitStore = tx.objectStore("units");

  const existingUsers = await reqToPromise(userStore.getAll());
  if (!existingUsers.length) {
    userStore.add({
      username: "Admin",
      passwordHash,
      role: "admin",
      isActive: true,
    });
  }

  const existingRates = await reqToPromise(rateStore.getAll());
  if (!existingRates.length) {
    for (const r of DEFAULT_RATES) {
      rateStore.add({ ...r, isActive: true });
    }
  }

  const existingUnits = await reqToPromise(unitStore.getAll());
  if (!existingUnits.length) {
    for (const u of DEFAULT_UNITS) unitStore.add(u);
  }

  await txDone(tx);
}

export function reservationYmPrefix(dateStr) {
  const raw = String(dateStr || "").slice(0, 7);
  const now = new Date();
  const y = raw.slice(0, 4) || String(now.getFullYear());
  const m = raw.slice(5, 7) || String(now.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

export async function nextReservationNo(dateStr) {
  const prefix = reservationYmPrefix(dateStr);
  const all = await reservations.getAll();
  let maxOrder = 0;
  for (const r of all) {
    const no = String(r.reservationNo ?? "");
    if (!no.startsWith(prefix)) continue;
    const order = Number(no.slice(prefix.length));
    if (!Number.isNaN(order)) maxOrder = Math.max(maxOrder, order);
  }
  return Number(`${prefix}${String(maxOrder + 1).padStart(2, "0")}`);
}

export async function getConflictingReservation(unit, date, excludeReservationId = null) {
  if (isTentUnit(unit)) return null;
  const unitId = unit.id ?? unit.unitId;
  const assignments = await reservationUnits.byIndex("unitId", unitId);
  for (const row of assignments) {
    if (excludeReservationId && row.reservationId === excludeReservationId) continue;
    const res = await reservations.get(row.reservationId);
    if (!res || res.status === "cancelled") continue;
    if (res.reservationDate === date) return res;
  }
  return null;
}

export async function saveReservationBundle({
  reservation,
  guestCounts: gc,
  assignedUnits,
  billing: bill,
}) {
  const db = await openDb();
  const storeNames = ["reservations", "guestCounts", "reservationUnits", "billing"];
  const tx = db.transaction(storeNames, "readwrite");
  const resStore = tx.objectStore("reservations");
  const gcStore = tx.objectStore("guestCounts");
  const ruStore = tx.objectStore("reservationUnits");
  const billStore = tx.objectStore("billing");

  const record = { ...reservation };
  if (record.id == null) delete record.id;
  let reservationId = record.id;
  if (reservationId) {
    await reqToPromise(resStore.put(record));
    const existingRu = await reqToPromise(ruStore.index("reservationId").getAll(reservationId));
    for (const row of existingRu) {
      await reqToPromise(ruStore.delete(row.id));
    }
  } else {
    reservationId = await reqToPromise(resStore.add(record));
  }

  await reqToPromise(gcStore.put({ ...gc, reservationId }));
  for (const u of assignedUnits) {
    await reqToPromise(
      ruStore.add({
        reservationId,
        unitId: u.unitId ?? u.id,
        rateApplied: Number(u.rateApplied ?? u.rate ?? 0),
      })
    );
  }
  await reqToPromise(billStore.put({ ...bill, reservationId }));
  await txDone(tx);
  markDirty();
  return reservationId;
}

export async function deleteReservationCascade(reservationId) {
  const db = await openDb();
  const tx = db.transaction(
    ["reservations", "guestCounts", "reservationUnits", "billing", "transactions"],
    "readwrite"
  );
  await reqToPromise(tx.objectStore("reservations").delete(reservationId));
  await reqToPromise(tx.objectStore("guestCounts").delete(reservationId));
  await reqToPromise(tx.objectStore("billing").delete(reservationId));
  const ru = await reqToPromise(
    tx.objectStore("reservationUnits").index("reservationId").getAll(reservationId)
  );
  for (const row of ru) {
    await reqToPromise(tx.objectStore("reservationUnits").delete(row.id));
  }
  const tr = await reqToPromise(
    tx.objectStore("transactions").index("reservationId").getAll(reservationId)
  );
  for (const row of tr) {
    await reqToPromise(tx.objectStore("transactions").delete(row.id));
  }
  await txDone(tx);
  markDirty();
}

export async function finalizeReservation({ reservationId, paymentType, amount, notes }) {
  const db = await openDb();
  const tx = db.transaction(["reservations", "transactions"], "readwrite");
  const res = await reqToPromise(tx.objectStore("reservations").get(reservationId));
  if (!res) throw new Error("Reservation not found");
  res.status = "completed";
  await reqToPromise(tx.objectStore("reservations").put(res));
  const txId = await reqToPromise(
    tx.objectStore("transactions").add({
      reservationId,
      paymentType,
      amount,
      transactionDate: new Date().toISOString(),
      notes,
    })
  );
  await txDone(tx);
  markDirty();
  return txId;
}

export async function cancelReservation(reservationId) {
  const res = await reservations.get(reservationId);
  if (!res) throw new Error("Reservation not found");
  res.status = "cancelled";
  await reservations.put(res);
}

export async function loadReservationFull(reservationId) {
  const reservation = await reservations.get(reservationId);
  if (!reservation) return null;
  const gc = (await guestCounts.get(reservationId)) || {};
  const bill = (await billing.get(reservationId)) || {};
  const ru = await reservationUnits.byIndex("reservationId", reservationId);
  const allUnits = await units.getAll();
  const assignedUnits = ru.map((row) => {
    const unit = allUnits.find((u) => u.id === row.unitId);
    return {
      ...row,
      unitName: unit?.unitName ?? `Unit #${row.unitId}`,
      stayType: unit?.stayType,
      rate: row.rateApplied,
    };
  });
  return { reservation, guestCounts: gc, billing: bill, assignedUnits };
}

export async function exportAll() {
  const payload = {
    app: "TukaMarinePark",
    version: 1,
    exportedAt: new Date().toISOString(),
    stores: {},
  };
  for (const name of Object.keys(STORES)) {
    payload.stores[name] = await repo(name).getAll();
  }
  return payload;
}

export async function importAll(payload) {
  if (!payload?.stores || typeof payload.stores !== "object") {
    throw new Error("Invalid backup file");
  }
  const db = await openDb();
  const names = Object.keys(STORES);
  const tx = db.transaction(names, "readwrite");
  for (const name of names) {
    const store = tx.objectStore(name);
    await reqToPromise(store.clear());
    const rows = payload.stores[name] || [];
    for (const row of rows) {
      await reqToPromise(store.put(row));
    }
  }
  await txDone(tx);
  markDirty();
}

const TRANSACTIONAL = [
  "reservations",
  "guestCounts",
  "reservationUnits",
  "billing",
  "transactions",
];

export async function resetTransactional() {
  const db = await openDb();
  const tx = db.transaction(TRANSACTIONAL, "readwrite");
  for (const name of TRANSACTIONAL) {
    await reqToPromise(tx.objectStore(name).clear());
  }
  await txDone(tx);
  markDirty();
}

export async function persistStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* ignore */
  }
}

export { openDb };
