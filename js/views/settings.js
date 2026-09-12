import {
  rates as ratesRepo,
  resetTransactional,
  units as unitsRepo,
  users as usersRepo,
  getUserByUsername,
} from "../db.js";
import { sha256Hex } from "../hash.js";
import { isAdmin } from "../session.js";
import { exportBackup, readBackupFile, restoreBackup } from "../backup.js";
import { formatPeso } from "../pricing.js";

export function renderSettings(container) {
  const admin = isAdmin();
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Settings</h2>
        <p class="muted">Rates, units, accounts, and database tools.</p>
      </div>
    </div>
    <div class="tabs">
      <button class="active" data-tab="rates">Rates</button>
      <button data-tab="units">Units</button>
      <button data-tab="users">Users</button>
      <button data-tab="database">Database</button>
    </div>
    <div class="card" id="tab-body"></div>
  `;

  const body = container.querySelector("#tab-body");
  const tabButtons = [...container.querySelectorAll("[data-tab]")];
  let tab = "rates";

  tabButtons.forEach((b) =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab;
      tabButtons.forEach((x) => x.classList.toggle("active", x === b));
      draw();
    })
  );

  async function draw() {
    if (tab === "rates") return drawRates();
    if (tab === "units") return drawUnits();
    if (tab === "users") return drawUsers();
    return drawDatabase();
  }

  async function drawRates() {
    const rows = await ratesRepo.getAll();
    body.innerHTML = `
      <h3>Guest rate card</h3>
      <table class="data">
        <thead><tr><th>Stay</th><th>Category</th><th>Price</th><th>Active</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>${escape(r.stayType)}</td>
              <td>${escape(r.category)}</td>
              <td><input data-price="${r.id}" type="number" min="0" step="0.01" value="${r.price}" style="width:120px" /></td>
              <td><input data-active="${r.id}" type="checkbox" ${r.isActive !== false ? "checked" : ""} /></td>
              <td><button class="btn ghost" data-save="${r.id}">Save</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
      <h3 style="margin-top:18px">Add rate</h3>
      <div class="grid-4">
        <div class="field"><label>Stay</label>
          <select id="nr-stay"><option>Day Tour</option><option>Overnight</option></select>
        </div>
        <div class="field"><label>Category</label>
          <select id="nr-cat">
            <option>Children</option><option>Adolescent</option><option>Adult</option><option>Senior_PWD</option>
          </select>
        </div>
        <div class="field"><label>Price</label><input id="nr-price" type="number" min="0" step="0.01" value="0" /></div>
        <div class="field"><label>&nbsp;</label><button class="btn primary" id="nr-add">Add</button></div>
      </div>
    `;
    body.querySelectorAll("[data-save]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = Number(b.dataset.save);
        const row = rows.find((r) => r.id === id);
        row.price = Number(body.querySelector(`[data-price="${id}"]`).value);
        row.isActive = body.querySelector(`[data-active="${id}"]`).checked;
        await ratesRepo.put(row);
        drawRates();
      })
    );
    body.querySelector("#nr-add").addEventListener("click", async () => {
      await ratesRepo.add({
        stayType: body.querySelector("#nr-stay").value,
        category: body.querySelector("#nr-cat").value,
        price: Number(body.querySelector("#nr-price").value || 0),
        isActive: true,
      });
      drawRates();
    });
  }

  async function drawUnits() {
    const rows = await unitsRepo.getAll();
    body.innerHTML = `
      <h3>Unit inventory</h3>
      <table class="data">
        <thead><tr><th>Name</th><th>Stay</th><th>Rate</th><th>Active</th><th></th></tr></thead>
        <tbody>
          ${rows.map((u) => `
            <tr>
              <td><input data-name="${u.id}" value="${escapeAttr(u.unitName)}" /></td>
              <td>
                <select data-stay="${u.id}">
                  <option ${u.stayType === "Day Tour" ? "selected" : ""}>Day Tour</option>
                  <option ${u.stayType === "Overnight" ? "selected" : ""}>Overnight</option>
                </select>
              </td>
              <td><input data-rate="${u.id}" type="number" min="0" step="0.01" value="${u.rate}" style="width:120px" /></td>
              <td><input data-uactive="${u.id}" type="checkbox" ${u.isActive !== false ? "checked" : ""} /></td>
              <td><button class="btn ghost" data-usave="${u.id}">Save</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
      <h3 style="margin-top:18px">Add unit</h3>
      <div class="grid-4">
        <div class="field"><label>Name</label><input id="nu-name" placeholder="Cottage C / Tent Space 3" /></div>
        <div class="field"><label>Stay</label>
          <select id="nu-stay"><option>Day Tour</option><option>Overnight</option></select>
        </div>
        <div class="field"><label>Rate</label><input id="nu-rate" type="number" min="0" step="0.01" value="0" /></div>
        <div class="field"><label>&nbsp;</label><button class="btn primary" id="nu-add">Add</button></div>
      </div>
      <p class="hint">Names containing “tent” are exempt from same-day double-booking checks. Inactive units stay in history but cannot be newly assigned. Current sample rate shown as ${rows[0] ? formatPeso(rows[0].rate) : "—"}.</p>
    `;
    body.querySelectorAll("[data-usave]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = Number(b.dataset.usave);
        const row = rows.find((u) => u.id === id);
        row.unitName = body.querySelector(`[data-name="${id}"]`).value.trim();
        row.stayType = body.querySelector(`[data-stay="${id}"]`).value;
        row.rate = Number(body.querySelector(`[data-rate="${id}"]`).value || 0);
        row.isActive = body.querySelector(`[data-uactive="${id}"]`).checked;
        await unitsRepo.put(row);
        drawUnits();
      })
    );
    body.querySelector("#nu-add").addEventListener("click", async () => {
      const unitName = body.querySelector("#nu-name").value.trim();
      if (!unitName) return alert("Unit name is required.");
      await unitsRepo.add({
        unitName,
        stayType: body.querySelector("#nu-stay").value,
        rate: Number(body.querySelector("#nu-rate").value || 0),
        isActive: true,
      });
      drawUnits();
    });
  }

  async function drawUsers() {
    if (!admin) {
      body.innerHTML = `<p>Only administrators can manage user accounts.</p>`;
      return;
    }
    const rows = await usersRepo.getAll();
    body.innerHTML = `
      <h3>User accounts</h3>
      <table class="data">
        <thead><tr><th>Username</th><th>Role</th><th>Active</th><th>New password</th><th></th></tr></thead>
        <tbody>
          ${rows.map((u) => `
            <tr>
              <td>${escape(u.username)}</td>
              <td>
                <select data-role="${u.id}">
                  <option value="staff" ${u.role === "staff" ? "selected" : ""}>staff</option>
                  <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
                </select>
              </td>
              <td><input data-uact="${u.id}" type="checkbox" ${u.isActive !== false ? "checked" : ""} /></td>
              <td><input data-pw="${u.id}" type="password" placeholder="Leave blank to keep" /></td>
              <td><button class="btn ghost" data-saveu="${u.id}">Save</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
      <h3 style="margin-top:18px">New user</h3>
      <div class="grid-4">
        <div class="field"><label>Username</label><input id="uu-name" /></div>
        <div class="field"><label>Password</label><input id="uu-pw" type="password" /></div>
        <div class="field"><label>Role</label>
          <select id="uu-role"><option value="staff">staff</option><option value="admin">admin</option></select>
        </div>
        <div class="field"><label>&nbsp;</label><button class="btn primary" id="uu-add">Create</button></div>
      </div>
    `;
    body.querySelectorAll("[data-saveu]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = Number(b.dataset.saveu);
        const row = rows.find((u) => u.id === id);
        row.role = body.querySelector(`[data-role="${id}"]`).value;
        row.isActive = body.querySelector(`[data-uact="${id}"]`).checked;
        const pw = body.querySelector(`[data-pw="${id}"]`).value;
        if (pw) row.passwordHash = await sha256Hex(pw);
        await usersRepo.put(row);
        drawUsers();
      })
    );
    body.querySelector("#uu-add").addEventListener("click", async () => {
      const username = body.querySelector("#uu-name").value.trim();
      const password = body.querySelector("#uu-pw").value;
      if (!username || !password) return alert("Username and password are required.");
      if (await getUserByUsername(username)) return alert("Username already exists.");
      await usersRepo.add({
        username,
        passwordHash: await sha256Hex(password),
        role: body.querySelector("#uu-role").value,
        isActive: true,
      });
      drawUsers();
    });
  }

  function drawDatabase() {
    if (!admin) {
      body.innerHTML = `<p>Database export, restore, and reset are limited to administrators.</p>`;
      return;
    }
    body.innerHTML = `
      <h3>Database</h3>
      <p class="muted">IndexedDB lives in this browser profile only. Export regularly. Restore replaces every store after confirmation. System reset clears reservations and transactions but keeps rates, units, and users.</p>
      <div class="actions">
        <button class="btn primary" id="exp">Export backup (JSON)</button>
        <label class="btn ghost" style="display:inline-flex;align-items:center;gap:8px">
          Import / restore
          <input id="imp" type="file" accept="application/json,.json" hidden />
        </label>
        <button class="btn danger" id="rst">System reset</button>
      </div>
      <p class="hint" id="db-msg"></p>
    `;
    body.querySelector("#exp").addEventListener("click", async () => {
      await exportBackup();
      body.querySelector("#db-msg").textContent = "Backup downloaded.";
    });
    body.querySelector("#imp").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!confirm("Restore will replace all current data. Continue?")) return;
      try {
        const payload = await readBackupFile(file);
        await restoreBackup(payload);
        body.querySelector("#db-msg").textContent = "Restore complete. Reload if screens look stale.";
      } catch (err) {
        body.querySelector("#db-msg").textContent = err.message || String(err);
      }
    });
    body.querySelector("#rst").addEventListener("click", async () => {
      if (!confirm("Clear all reservations, guest counts, assignments, billing, and transactions?")) return;
      await resetTransactional();
      body.querySelector("#db-msg").textContent = "Transactional stores cleared.";
    });
  }

  draw();
  return { cleanup() { container.replaceChildren(); } };
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escape(s).replace(/"/g, "&quot;");
}
