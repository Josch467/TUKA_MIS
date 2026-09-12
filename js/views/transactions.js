import { billing as billingRepo, guestCounts, loadReservationFull, rates as ratesRepo, reservationUnits, reservations as resRepo, transactions as txRepo } from "../db.js";
import { formatPeso, paymentTypeFromReference } from "../pricing.js";
import { exportGovernmentReports } from "../report-export.js";
import { buildReceiptText, printReceipt } from "../receipt.js";
import { getSession } from "../session.js";

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function renderTransactions(container) {
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Transactions</h2>
        <p class="muted">History, reprint, and government-format exports.</p>
      </div>
    </div>
    <div class="grid-3" id="stats"></div>
    <div class="card" style="margin-top:16px">
      <div class="toolbar">
        <input type="date" id="from" value="${monthStart()}" />
        <input type="date" id="to" value="${todayIso()}" />
        <input type="search" id="q" placeholder="Search notes, type, reservation…" />
        <button class="btn primary" type="button" id="export">Export reports (.xlsx)</button>
      </div>
      <table class="data">
        <thead>
          <tr><th>When</th><th>Reservation</th><th>Ref. no.</th><th>Type</th><th>Amount</th><th>Notes</th><th></th></tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  `;

  const from = container.querySelector("#from");
  const to = container.querySelector("#to");
  const q = container.querySelector("#q");

  async function draw() {
    const all = await txRepo.getAll();
    const term = q.value.trim().toLowerCase();
    const start = from.value;
    const end = to.value;
    const filtered = [];
    for (const t of all.sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate)))) {
      const day = String(t.transactionDate).slice(0, 10);
      if (start && day < start) continue;
      if (end && day > end) continue;
      const r = term ? await resRepo.get(t.reservationId) : null;
      const blob = `${t.paymentType} ${t.notes || ""} ${t.reservationId} ${r?.reservationNo || ""} ${r?.referenceNo || ""} ${r?.reservedBy || ""}`.toLowerCase();
      if (term && !blob.includes(term)) continue;
      filtered.push(t);
    }
    const revenue = filtered.reduce((s, t) => s + Number(t.amount || 0), 0);
    container.querySelector("#stats").innerHTML = `
      <div class="stat"><span class="muted">Count</span><b>${filtered.length}</b></div>
      <div class="stat"><span class="muted">Revenue</span><b>${formatPeso(revenue)}</b></div>
      <div class="stat"><span class="muted">Range</span><b style="font-size:16px">${start} → ${end}</b></div>
    `;
    const tbody = container.querySelector("#rows");
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">No transactions in this range.</td></tr>`;
      return;
    }
    const resCache = {};
    tbody.innerHTML = (
      await Promise.all(
        filtered.map(async (t) => {
          if (!resCache[t.reservationId]) resCache[t.reservationId] = await resRepo.get(t.reservationId);
          const r = resCache[t.reservationId];
          return `<tr>
            <td>${new Date(t.transactionDate).toLocaleString()}</td>
            <td>#${r?.reservationNo ?? t.reservationId} ${escape(r?.reservedBy || "")}</td>
            <td>${escape(r?.referenceNo || "—")}</td>
            <td>${escape(t.paymentType)}</td>
            <td>${formatPeso(t.amount)}</td>
            <td>${escape(t.notes || "")}</td>
            <td><button class="btn ghost" data-reprint="${t.reservationId}">Reprint</button></td>
          </tr>`;
        })
      )
    ).join("");
    tbody.querySelectorAll("[data-reprint]").forEach((b) =>
      b.addEventListener("click", () => reprint(Number(b.dataset.reprint)))
    );
  }

  async function reprint(id) {
    const full = await loadReservationFull(id);
    if (!full) return;
    const rates = await ratesRepo.getAll();
    printReceipt(
      buildReceiptText({
        reservation: full.reservation,
        guestCounts: full.guestCounts,
        assignedUnits: full.assignedUnits,
        billing: full.billing,
        rates,
        processedBy: getSession().loggedInUsername,
        paymentType: paymentTypeFromReference(full.reservation.referenceNo),
      })
    );
  }

  container.querySelector("#export").addEventListener("click", async () => {
    try {
      const y = Number(from.value.slice(0, 4));
      const m = Number(from.value.slice(5, 7));
      const allRes = await resRepo.getAll();
      const allGc = await guestCounts.getAll();
      const allBill = await billingRepo.getAll();
      const allRu = await reservationUnits.getAll();
      const map = {};
      for (const g of allGc) map[g.reservationId] = g;
      const billingById = {};
      for (const b of allBill) billingById[b.reservationId] = b;
      const unitsByResId = {};
      for (const u of allRu) {
        (unitsByResId[u.reservationId] ||= []).push(u);
      }
      exportGovernmentReports({
        year: y,
        month: m,
        from: from.value,
        to: to.value,
        reservations: allRes,
        guestCountsById: map,
        billingById,
        unitsByResId,
      });
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  from.addEventListener("change", draw);
  to.addEventListener("change", draw);
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
