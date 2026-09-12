import { isTentUnit } from "../pricing.js";
import { formatPeso } from "../pricing.js";
import { getConflictingReservation, units as unitsRepo } from "../db.js";

export function openSelectUnit({ stayType, date, excludeReservationId } = {}) {
  return new Promise(async (resolve) => {
    const all = (await unitsRepo.getAll()).filter((u) => u.isActive !== false);
    const filtered = stayType ? all.filter((u) => u.stayType === stayType) : all;

    const dialog = document.createElement("dialog");
    dialog.className = "modal";
    dialog.innerHTML = `
      <div class="modal-head">
        <h3>Select unit</h3>
        <button class="btn ghost" type="button" data-close>Close</button>
      </div>
      <div class="modal-body">
        <p class="muted">Active ${stayType || ""} inventory for ${date || "the selected date"}. Tent spaces may be assigned more than once on the same day.</p>
        <table class="data">
          <thead>
            <tr><th>Unit</th><th>Stay</th><th>Rate</th><th>Availability</th><th></th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;
    document.body.appendChild(dialog);
    const tbody = dialog.querySelector("tbody");

    for (const unit of filtered) {
      const conflict = date
        ? await getConflictingReservation(unit, date, excludeReservationId)
        : null;
      const available = !conflict;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escape(unit.unitName)}</td>
        <td>${escape(unit.stayType)}</td>
        <td>${formatPeso(unit.rate)}</td>
        <td>${available ? (isTentUnit(unit) ? "Open (tent)" : "Available") : `Taken (#${conflict.reservationNo})`}</td>
        <td></td>
      `;
      const btn = document.createElement("button");
      btn.className = "btn primary";
      btn.type = "button";
      btn.textContent = "Select";
      btn.disabled = !available && !isTentUnit(unit);
      btn.addEventListener("click", () => finish({
        id: unit.id,
        unitId: unit.id,
        unitName: unit.unitName,
        stayType: unit.stayType,
        rate: unit.rate,
        rateApplied: unit.rate,
      }));
      tr.lastElementChild.appendChild(btn);
      tbody.appendChild(tr);
    }

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">No active units for this stay type.</td></tr>`;
    }

    function finish(value) {
      dialog.close();
      dialog.remove();
      resolve(value);
    }

    dialog.querySelector("[data-close]").addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      finish(null);
    });
    dialog.showModal();
  });
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
