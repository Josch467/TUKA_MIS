import { loadReservationFull, reservations as resRepo, cancelReservation, finalizeReservation, billing as billingRepo, rates as ratesRepo } from "../db.js";
import { formatPeso, paymentTypeFromReference } from "../pricing.js";
import { getSession } from "../session.js";
import { buildReceiptText, printReceipt } from "../receipt.js";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function renderReservations(container, { onEdit } = {}) {
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Reservations</h2>
        <p class="muted">Filter, search, edit, finalize, or cancel.</p>
      </div>
    </div>
    <div class="card">
      <div class="toolbar">
        <select id="filter">
          <option value="all">All</option>
          <option value="upcoming">Upcoming</option>
          <option value="today" selected>Today</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="date">Specific date</option>
        </select>
        <input type="date" id="date" value="${todayIso()}" />
        <input type="search" id="q" placeholder="Search guest, ID, contact, reference…" />
      </div>
      <table class="data">
        <thead>
          <tr>
            <th>Reservation ID</th><th>Guest</th><th>Date</th><th>Stay</th><th>Ref. no.</th><th>Status</th><th>Due</th><th></th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  `;

  const filter = container.querySelector("#filter");
  const date = container.querySelector("#date");
  const q = container.querySelector("#q");

  async function draw() {
    const all = await resRepo.getAll();
    const t = todayIso();
    const term = q.value.trim().toLowerCase();
    const mode = filter.value;
    const rows = [];
    for (const r of all.sort((a, b) => (b.reservationDate || "").localeCompare(a.reservationDate || ""))) {
      if (mode === "today" && r.reservationDate !== t) continue;
      if (mode === "upcoming" && !(r.reservationDate > t && r.status === "pending")) continue;
      if (mode === "completed" && r.status !== "completed") continue;
      if (mode === "cancelled" && r.status !== "cancelled") continue;
      if (mode === "date" && r.reservationDate !== date.value) continue;
      const blob = `${r.reservationNo} ${r.reservedBy} ${r.contactNo || ""} ${r.referenceNo || ""}`.toLowerCase();
      if (term && !blob.includes(term)) continue;
      const full = await loadReservationFull(r.id);
      rows.push({ r, due: full?.billing?.finalAmount ?? 0 });
    }
    const tbody = container.querySelector("#rows");
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">No reservations match this filter.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map(
        ({ r, due }) => `
        <tr>
          <td>${r.reservationNo}</td>
          <td>${escape(r.reservedBy)}<div class="muted">${escape(r.contactNo || "")}</div></td>
          <td>${r.reservationDate}</td>
          <td>${escape(r.stayType)}</td>
          <td>${escape(r.referenceNo || "—")}</td>
          <td><span class="status ${r.status}">${r.status}</span></td>
          <td>${formatPeso(due)}</td>
          <td>
            <button class="btn ghost" data-edit="${r.id}">Edit</button>
            <button class="btn gold" data-fin="${r.id}">Finalize</button>
            <button class="btn danger" data-can="${r.id}">Cancel</button>
          </td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => onEdit?.(Number(b.dataset.edit)))
    );
    tbody.querySelectorAll("[data-fin]").forEach((b) =>
      b.addEventListener("click", () => doFinalize(Number(b.dataset.fin)))
    );
    tbody.querySelectorAll("[data-can]").forEach((b) =>
      b.addEventListener("click", () => doCancel(Number(b.dataset.can)))
    );
  }

  async function doFinalize(id) {
    const full = await loadReservationFull(id);
    if (!full) return;
    if (full.reservation.status === "cancelled") return alert("Cannot finalize a cancelled reservation.");
    const bill = await billingRepo.get(id);
    if (full.reservation.status !== "completed") {
      await finalizeReservation({
        reservationId: id,
        paymentType: paymentTypeFromReference(full.reservation.referenceNo),
        amount: bill?.finalAmount ?? 0,
        notes: `Processed by: ${getSession().loggedInUsername}`,
      });
    }
    const rates = await ratesRepo.getAll();
    const updated = await loadReservationFull(id);
    printReceipt(
      buildReceiptText({
        reservation: updated.reservation,
        guestCounts: updated.guestCounts,
        assignedUnits: updated.assignedUnits,
        billing: updated.billing,
        rates,
        processedBy: getSession().loggedInUsername,
        paymentType: paymentTypeFromReference(updated.reservation.referenceNo),
      })
    );
    draw();
  }

  async function doCancel(id) {
    if (!confirm("Cancel this reservation?")) return;
    await cancelReservation(id);
    draw();
  }

  filter.addEventListener("change", draw);
  date.addEventListener("change", draw);
  q.addEventListener("input", draw);
  draw();

  return { cleanup() { container.replaceChildren(); } };
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
