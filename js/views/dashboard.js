import {
  billing as billingRepo,
  cancelReservation,
  finalizeReservation,
  getConflictingReservation,
  loadReservationFull,
  nextReservationNo,
  rates as ratesRepo,
  saveReservationBundle,
} from "../db.js";
import {
  computeBilling,
  formatPeso,
  guestTotals,
  hasBillableGuests,
  normalizeCharges,
  paymentTypeFromReference,
} from "../pricing.js";
import { getSession } from "../session.js";
import { buildReceiptText, printReceipt } from "../receipt.js";
import { openSelectUnit } from "../components/select-unit.js";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyGuests() {
  return {
    inMen: 0, inWomen: 0, outMen: 0, outWomen: 0,
    foreignMen: 0, foreignWomen: 0,
    children: 0, adolescent: 0, adult: 0, seniorPwd: 0,
  };
}

export function renderDashboard(container, { reservationId = null, onAfterSave } = {}) {
  let assignedUnits = [];
  let extraCharges = [];
  let currentId = reservationId;
  let reservationNo = null;

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2 id="form-title">New reservation</h2>
        <p class="muted" id="form-sub">Guest details, unit assignment, and live billing on one screen.</p>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>Reservation</h3>
        <div class="grid-3">
          <div class="field"><label for="reservedBy">Reserved by</label><input id="reservedBy" required /></div>
          <div class="field"><label for="contactNo">Contact no.</label><input id="contactNo" /></div>
          <div class="field"><label for="reservationDate">Reservation date</label><input id="reservationDate" type="date" /></div>
          <div class="field">
            <label for="stayType">Stay type</label>
            <select id="stayType">
              <option>Day Tour</option>
              <option>Overnight</option>
            </select>
          </div>
          <div class="field"><label for="duration">Duration (nights)</label><input id="duration" type="number" min="1" value="1" /></div>
          <div class="field"><label for="referenceNo">GCash reference</label><input id="referenceNo" placeholder="Leave blank for cash" /></div>
        </div>
        <h3 style="margin-top:18px">Guest counts</h3>
        <div class="guest-grid">
          ${numField("inMen", "In-province men")}
          ${numField("inWomen", "In-province women")}
          ${numField("outMen", "Out-of-province men")}
          ${numField("outWomen", "Out-of-province women")}
          ${numField("foreignMen", "Foreign men")}
          ${numField("foreignWomen", "Foreign women")}
          ${numField("children", "Children")}
          ${numField("adolescent", "Adolescent")}
          ${numField("adult", "Adult")}
          ${numField("seniorPwd", "Senior / PWD")}
        </div>
        <h3 style="margin-top:18px">Units</h3>
        <div class="unit-list" id="unit-list"></div>
        <div class="actions">
          <button class="btn ghost" type="button" id="add-unit">Add unit</button>
        </div>
      </div>
      <div class="card">
        <h3>Billing</h3>
        <div class="field"><label for="downPayment">Down payment</label><input id="downPayment" type="number" min="0" step="0.01" value="0" /></div>
        <div class="charges-box">
          <h4>Additional charges</h4>
          <div class="charge-presets">
            <button class="charge-chip" type="button" data-preset="Garbage Fees">Garbage Fees</button>
            <button class="charge-chip" type="button" data-preset="Environmental Fees">Environmental Fees</button>
            <button class="charge-chip" type="button" data-preset="Baggage Fees">Baggage Fees</button>
          </div>
          <div id="charges-list"></div>
          <div class="charge-add">
            <input id="charge-name" placeholder="Charge name" />
            <input id="charge-amt" type="number" min="0" step="0.01" placeholder="Amount" />
            <button class="btn ghost" type="button" id="add-charge">Add</button>
          </div>
        </div>
        <div class="totals" id="totals"></div>
        <p class="muted" id="pay-type"></p>
        <div class="actions">
          <button class="btn primary" type="button" id="save-btn">Save</button>
          <button class="btn gold" type="button" id="finalize-btn">Finalize</button>
          <button class="btn danger" type="button" id="cancel-btn">Cancel reservation</button>
        </div>
        <p class="hint" id="form-msg"></p>
      </div>
    </div>
  `;

  const els = {
    reservedBy: container.querySelector("#reservedBy"),
    contactNo: container.querySelector("#contactNo"),
    reservationDate: container.querySelector("#reservationDate"),
    stayType: container.querySelector("#stayType"),
    duration: container.querySelector("#duration"),
    referenceNo: container.querySelector("#referenceNo"),
    downPayment: container.querySelector("#downPayment"),
  };
  els.reservationDate.value = todayIso();

  function guestInput(name) {
    return Number(container.querySelector("#" + name).value || 0);
  }
  function readGuests() {
    return guestTotals({
      inMen: guestInput("inMen"),
      inWomen: guestInput("inWomen"),
      outMen: guestInput("outMen"),
      outWomen: guestInput("outWomen"),
      foreignMen: guestInput("foreignMen"),
      foreignWomen: guestInput("foreignWomen"),
      children: guestInput("children"),
      adolescent: guestInput("adolescent"),
      adult: guestInput("adult"),
      seniorPwd: guestInput("seniorPwd"),
    });
  }

  async function liveBill() {
    const rates = await ratesRepo.getAll();
    const gc = readGuests();
    const bill = computeBilling({
      guestCounts: gc,
      units: assignedUnits,
      rates,
      stayType: els.stayType.value,
      downPayment: els.downPayment.value,
      additionalCharges: extraCharges,
    });
    const extraRows = (bill.additionalCharges || [])
      .map((c) => `<div class="row"><span>${escape(c.name)}</span><b>${formatPeso(c.amount)}</b></div>`)
      .join("");
    container.querySelector("#totals").innerHTML = `
      <div class="row"><span>Guest fees</span><b>${formatPeso(bill.guestTotal)}</b></div>
      <div class="row"><span>Accommodation</span><b>${formatPeso(bill.unitTotal)}</b></div>
      ${extraRows}
      <div class="row"><span>Additional charges</span><b>${formatPeso(bill.additionalTotal)}</b></div>
      <div class="row"><span>Down payment</span><b>${formatPeso(bill.downPayment)}</b></div>
      <div class="row grand"><span>Amount due</span><b>${formatPeso(bill.finalAmount)}</b></div>
    `;
    const pay = paymentTypeFromReference(els.referenceNo.value);
    container.querySelector("#pay-type").textContent = `Payment type on finalize: ${pay}`;
    return { gc, bill, rates, pay };
  }

  function renderUnits() {
    const list = container.querySelector("#unit-list");
    if (!assignedUnits.length) {
      list.innerHTML = `<div class="empty">No units assigned yet.</div>`;
      return;
    }
    list.innerHTML = assignedUnits
      .map(
        (u, i) => `
        <div class="unit-chip">
          <div><strong>${escape(u.unitName)}</strong><div class="muted">${formatPeso(u.rateApplied ?? u.rate)}</div></div>
          <button class="btn ghost" type="button" data-remove="${i}">Remove</button>
        </div>`
      )
      .join("");
    list.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        assignedUnits.splice(Number(btn.dataset.remove), 1);
        renderUnits();
        liveBill();
      });
    });
  }

  container.addEventListener("input", () => liveBill());
  container.querySelector("#add-unit").addEventListener("click", async () => {
    const picked = await openSelectUnit({
      stayType: els.stayType.value,
      date: els.reservationDate.value,
      excludeReservationId: currentId,
    });
    if (!picked) return;
    assignedUnits.push(picked);
    renderUnits();
    liveBill();
  });

  function renderCharges() {
    const list = container.querySelector("#charges-list");
    if (!extraCharges.length) {
      list.innerHTML = `<div class="muted" style="font-size:13px;padding:4px 0">No extra fees yet.</div>`;
      return;
    }
    list.innerHTML = extraCharges
      .map(
        (c, i) => `
        <div class="charge-row">
          <span>${escape(c.name)}</span>
          <span>${formatPeso(c.amount)} <button class="btn ghost" type="button" data-rm-charge="${i}">Remove</button></span>
        </div>`
      )
      .join("");
    list.querySelectorAll("[data-rm-charge]").forEach((btn) => {
      btn.addEventListener("click", () => {
        extraCharges.splice(Number(btn.dataset.rmCharge), 1);
        renderCharges();
        liveBill();
      });
    });
  }

  function addCharge(name, amount) {
    const label = String(name || "").trim();
    const amt = Number(amount || 0);
    if (!label) {
      setMsg("Enter a charge name.");
      return;
    }
    extraCharges.push({ name: label, amount: amt });
    container.querySelector("#charge-name").value = "";
    container.querySelector("#charge-amt").value = "";
    renderCharges();
    liveBill();
  }

  container.querySelector("#add-charge").addEventListener("click", () => {
    addCharge(container.querySelector("#charge-name").value, container.querySelector("#charge-amt").value);
  });
  container.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelector("#charge-name").value = btn.dataset.preset;
      container.querySelector("#charge-amt").focus();
    });
  });

  function setMsg(text, ok = false) {
    const el = container.querySelector("#form-msg");
    el.textContent = text;
    el.style.color = ok ? "#0f6b55" : "";
  }

  async function collectAndValidate() {
    const reservedBy = els.reservedBy.value.trim();
    if (!reservedBy) throw new Error("Guest name is required.");
    const { gc, bill } = await liveBill();
    if (!hasBillableGuests(gc)) throw new Error("Enter at least one billable guest (age category).");
    for (const u of assignedUnits) {
      const conflict = await getConflictingReservation(
        u,
        els.reservationDate.value,
        currentId
      );
      if (conflict) {
        throw new Error(`${u.unitName} is already booked on ${els.reservationDate.value} (reservation #${conflict.reservationNo}).`);
      }
    }
    const reservation = {
      id: currentId || undefined,
      reservationNo: reservationNo ?? (await nextReservationNo(els.reservationDate.value)),
      reservedBy,
      contactNo: els.contactNo.value.trim(),
      reservationDate: els.reservationDate.value,
      stayType: els.stayType.value,
      duration: Number(els.duration.value || 1),
      status: "pending",
      createdBy: getSession().loggedInUserId,
      referenceNo: els.referenceNo.value.trim(),
    };
    return { reservation, gc, bill };
  }

  container.querySelector("#save-btn").addEventListener("click", async () => {
    try {
      const { reservation, gc, bill } = await collectAndValidate();
      if (currentId) {
        const existing = await loadReservationFull(currentId);
        reservation.status = existing.reservation.status;
        reservation.id = currentId;
        reservation.reservationNo = existing.reservation.reservationNo;
      }
      currentId = await saveReservationBundle({
        reservation,
        guestCounts: gc,
        assignedUnits,
        billing: bill,
      });
      reservationNo = reservation.reservationNo;
      container.querySelector("#form-title").textContent = `Reservation #${reservationNo}`;
      setMsg("Saved.", true);
      onAfterSave?.();
    } catch (err) {
      setMsg(err.message || String(err));
    }
  });

  container.querySelector("#finalize-btn").addEventListener("click", async () => {
    try {
      if (!currentId) {
        const { reservation, gc, bill } = await collectAndValidate();
        currentId = await saveReservationBundle({
          reservation,
          guestCounts: gc,
          assignedUnits,
          billing: bill,
        });
        reservationNo = reservation.reservationNo;
      } else {
        const { reservation, gc, bill } = await collectAndValidate();
        reservation.id = currentId;
        reservation.status = "pending";
        await saveReservationBundle({ reservation, guestCounts: gc, assignedUnits, billing: bill });
      }
      const full = await loadReservationFull(currentId);
      if (full.reservation.status === "cancelled") throw new Error("Cannot finalize a cancelled reservation.");
      if (full.reservation.status === "completed") {
        reprint(full);
        return;
      }
      const bill = await billingRepo.get(currentId);
      const pay = paymentTypeFromReference(full.reservation.referenceNo);
      await finalizeReservation({
        reservationId: currentId,
        paymentType: pay,
        amount: bill.finalAmount,
        notes: `Processed by: ${getSession().loggedInUsername}`,
      });
      const rates = await ratesRepo.getAll();
      const updated = await loadReservationFull(currentId);
      printReceipt(
        buildReceiptText({
          reservation: updated.reservation,
          guestCounts: updated.guestCounts,
          assignedUnits: updated.assignedUnits,
          billing: updated.billing,
          rates,
          processedBy: getSession().loggedInUsername,
          paymentType: pay,
        })
      );
      setMsg("Finalized. Receipt sent to printer.", true);
      onAfterSave?.();
    } catch (err) {
      setMsg(err.message || String(err));
    }
  });

  container.querySelector("#cancel-btn").addEventListener("click", async () => {
    try {
      if (!currentId) throw new Error("Save the reservation first.");
      if (!confirm("Cancel this reservation?")) return;
      await cancelReservation(currentId);
      setMsg("Reservation cancelled.");
      onAfterSave?.();
    } catch (err) {
      setMsg(err.message || String(err));
    }
  });

  async function reprint(full) {
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

  async function hydrate() {
    if (!currentId) {
      renderUnits();
      renderCharges();
      await liveBill();
      return;
    }
    const full = await loadReservationFull(currentId);
    if (!full) return;
    reservationNo = full.reservation.reservationNo;
    container.querySelector("#form-title").textContent = `Reservation #${reservationNo}`;
    els.reservedBy.value = full.reservation.reservedBy || "";
    els.contactNo.value = full.reservation.contactNo || "";
    els.reservationDate.value = full.reservation.reservationDate || todayIso();
    els.stayType.value = full.reservation.stayType || "Day Tour";
    els.duration.value = full.reservation.duration || 1;
    els.referenceNo.value = full.reservation.referenceNo || "";
    els.downPayment.value = full.billing.downPayment || 0;
    extraCharges = normalizeCharges(full.billing.additionalCharges);
    const gc = { ...emptyGuests(), ...full.guestCounts };
    for (const key of Object.keys(emptyGuests())) {
      const input = container.querySelector("#" + key);
      if (input) input.value = gc[key] ?? 0;
    }
    assignedUnits = full.assignedUnits;
    renderUnits();
    renderCharges();
    await liveBill();
  }

  hydrate();

  return {
    cleanup() {
      container.replaceChildren();
    },
  };
}

function numField(id, label) {
  return `<div class="field"><label for="${id}">${label}</label><input class="num" id="${id}" type="number" min="0" value="0" /></div>`;
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
