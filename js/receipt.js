import { computeBilling, formatPeso, paymentTypeFromReference } from "./pricing.js";

function line(text = "") {
  return text;
}

export function buildReceiptText({
  reservation,
  guestCounts,
  assignedUnits,
  billing,
  rates,
  processedBy,
  paymentType,
}) {
  const stayType = reservation.stayType;
  const math = computeBilling({
    guestCounts,
    units: assignedUnits,
    rates,
    stayType,
    downPayment: billing.downPayment,
    discount: billing.discount,
    additionalCharges: billing.additionalCharges,
  });
  const type = paymentType || paymentTypeFromReference(reservation.referenceNo);
  const width = 42;
  const hr = "-".repeat(width);
  const rows = [
    line("TUKA MARINE PARK"),
    line("Resort Management Information System"),
    hr,
    line(`Reservation #: ${reservation.reservationNo}`),
    line(`Guest: ${reservation.reservedBy}`),
    line(`Contact: ${reservation.contactNo || "—"}`),
    line(`Res Date: ${reservation.reservationDate}`),
    line(`Stay: ${reservation.stayType}${reservation.stayType === "Overnight" ? ` (${reservation.duration || 1} night/s)` : ""}`),
    line(`Status: ${reservation.status}`),
    hr,
    line("GUEST BREAKDOWN"),
    line(`  In-province (M/W): ${guestCounts.inMen || 0} / ${guestCounts.inWomen || 0}`),
    line(`  Out-of-province (M/W): ${guestCounts.outMen || 0} / ${guestCounts.outWomen || 0}`),
    line(`  Foreign (M/W): ${guestCounts.foreignMen || 0} / ${guestCounts.foreignWomen || 0}`),
    line(`  Children: ${guestCounts.children || 0}  x ${formatPeso(math.ratesUsed.Children)} = ${formatPeso(math.guestBreakdown.Children)}`),
    line(`  Adolescent: ${guestCounts.adolescent || 0}  x ${formatPeso(math.ratesUsed.Adolescent)} = ${formatPeso(math.guestBreakdown.Adolescent)}`),
    line(`  Adult: ${guestCounts.adult || 0}  x ${formatPeso(math.ratesUsed.Adult)} = ${formatPeso(math.guestBreakdown.Adult)}`),
    line(`  Senior/PWD: ${guestCounts.seniorPwd || 0}  x ${formatPeso(math.ratesUsed.Senior_PWD)} = ${formatPeso(math.guestBreakdown.Senior_PWD)}`),
    line(`  Total guests: ${guestCounts.totalGuests || 0}`),
    hr,
    line("UNITS"),
  ];
  if (!assignedUnits?.length) rows.push(line("  (none)"));
  else {
    for (const u of assignedUnits) {
      rows.push(line(`  ${u.unitName}  ${formatPeso(u.rateApplied ?? u.rate)}`));
    }
  }
  rows.push(
    hr,
    line(`Guest fees: ${formatPeso(math.guestTotal)}`),
    line(`Accommodation: ${formatPeso(math.unitTotal)}`),
    ...(math.additionalCharges || []).map((c) => line(`  ${c.name}: ${formatPeso(c.amount)}`)),
    line(`Additional charges: ${formatPeso(math.additionalTotal)}`),
    line(`Down payment: ${formatPeso(math.downPayment)}`),
    line(`AMOUNT DUE: ${formatPeso(math.finalAmount)}`),
    line(`Payment: ${type}`),
    line(`GCash ref: ${reservation.referenceNo || "—"}`),
    hr,
    line(`Processed by: ${processedBy || "—"}`),
    line(new Date().toLocaleString()),
    line("Thank you for visiting Tuka Marine Park"),
    line("Our Home, Your Paradise")
  );
  return rows.join("\n");
}

export function printReceipt(text) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>Receipt</title>
<style>
  @page { size: 80mm auto; margin: 8mm; }
  body { font-family: "Consolas", "Courier New", monospace; font-size: 12px; color: #111; }
  pre { white-space: pre-wrap; margin: 0; }
</style></head><body><pre>${escapeHtml(text)}</pre></body></html>`);
  doc.close();
  frame.onload = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 500);
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
