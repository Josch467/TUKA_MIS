function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseIsoDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  const x = new Date(date);
  x.setDate(x.getDate() + n);
  return x;
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleString("en-PH", { month: "long", year: "numeric" });
}

function originLocal(gc = {}) {
  return Number(gc.inMen ?? 0) + Number(gc.inWomen ?? 0) + Number(gc.outMen ?? 0) + Number(gc.outWomen ?? 0);
}

function originForeign(gc = {}) {
  return Number(gc.foreignMen ?? 0) + Number(gc.foreignWomen ?? 0);
}

function headcount(gc = {}) {
  const age =
    Number(gc.children ?? 0) +
    Number(gc.adolescent ?? 0) +
    Number(gc.adult ?? 0) +
    Number(gc.seniorPwd ?? 0);
  const origin = originLocal(gc) + originForeign(gc);
  return age || origin;
}

function inMonth(day, year, month) {
  return day.getFullYear() === year && day.getMonth() + 1 === month;
}

function occupancyNights(res) {
  if (res.stayType === "Overnight") return Math.max(1, Number(res.duration || 1));
  return 1;
}

function applyBorders(ws, r0, c0, r1, c1) {
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      ws[ref].s = {
        font: { name: "Calibri", sz: 10 },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } },
        },
      };
    }
  }
}

function downloadWorkbook(wb, filename) {
  if (typeof XLSX === "undefined") {
    throw new Error("SheetJS library failed to load. Serve the app over http(s) so the CDN script can run.");
  }
  XLSX.writeFile(wb, filename);
}

function buildOvernightSheet({ year, month, reservations, guestCountsById, unitsByResId }) {
  const dim = daysInMonth(year, month);
  const rooms = Array(dim).fill(0);
  const checkIn = Array(dim).fill(0);
  const overnight = Array(dim).fill(0);
  const local = Array(dim).fill(0);
  const foreign = Array(dim).fill(0);

  for (const res of reservations) {
    if (res.status === "cancelled") continue;
    if (res.stayType !== "Overnight") continue;
    const gc = guestCountsById[res.id] || {};
    const start = parseIsoDate(res.reservationDate);
    const nights = occupancyNights(res);
    const unitCount = (unitsByResId[res.id] || []).length;
    const guests = headcount(gc);
    const loc = originLocal(gc);
    const forgn = originForeign(gc);

    for (let i = 0; i < nights; i++) {
      const day = addDays(start, i);
      if (!inMonth(day, year, month)) continue;
      const col = day.getDate() - 1;
      rooms[col] += unitCount;
      overnight[col] += guests;
      local[col] += loc;
      foreign[col] += forgn;
      if (i === 0) checkIn[col] += guests;
    }
  }

  const aoa = [];
  aoa.push(["Monthly Recording Format :", "OVERNIGHT / TOURIST"]);
  aoa.push([]);
  aoa.push(["Name of Establishment:", "Tuka Marine Park"]);
  aoa.push([]);
  aoa.push(["DAY", "Total Rooms Occupied", "No. of Guest Check in", "No. of Guest Over Night", "LOCAL", "FOREIGN"]);
  for (let d = 1; d <= 31; d++) {
    if (d > dim) {
      aoa.push([d, "", "", "", "", ""]);
      continue;
    }
    aoa.push([d, rooms[d - 1], checkIn[d - 1], overnight[d - 1], local[d - 1], foreign[d - 1]]);
  }
  const totalExcelRow = 37;
  aoa.push([
    "TOTAL",
    { t: "n", f: `SUM(B6:B36)` },
    { t: "n", f: `SUM(C6:C36)` },
    { t: "n", f: `SUM(D6:D36)` },
    { t: "n", f: `SUM(E6:E36)` },
    { t: "n", f: `SUM(F6:F36)` },
  ]);
  aoa.push([]);
  aoa.push(["Prepared & Submitted by:", ""]);
  aoa.push([]);
  aoa.push(["Date:", monthLabel(year, month)]);
  aoa.push([]);
  aoa.push(["Note:", ""]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 1 }, e: { r: 0, c: 5 } },
    { s: { r: 2, c: 1 }, e: { r: 2, c: 5 } },
  ];
  ws["!cols"] = [
    { wch: 28 },
    { wch: 22 },
    { wch: 22 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
  ];
  ws["!rows"] = [{ hpt: 22 }, {}, { hpt: 20 }];
  applyBorders(ws, 4, 0, 36, 5);
  void totalExcelRow;
  return ws;
}

function buildVar1Sheet({ year, month, reservations, guestCountsById }) {
  const dim = daysInMonth(year, month);
  const blank = () => ({
    inM: 0, inF: 0,
    outM: 0, outF: 0,
    forM: 0, forF: 0,
  });
  const days = Array.from({ length: dim }, blank);

  for (const res of reservations) {
    if (res.status === "cancelled") continue;
    if (res.stayType !== "Day Tour") continue;
    const gc = guestCountsById[res.id] || {};
    const start = parseIsoDate(res.reservationDate);
    if (!inMonth(start, year, month)) continue;
    const row = days[start.getDate() - 1];
    row.inM += Number(gc.inMen ?? 0);
    row.inF += Number(gc.inWomen ?? 0);
    row.outM += Number(gc.outMen ?? 0);
    row.outF += Number(gc.outWomen ?? 0);
    row.forM += Number(gc.foreignMen ?? 0);
    row.forF += Number(gc.foreignWomen ?? 0);
  }

  const aoa = [];
  aoa.push(["MUNICIPALITY OF KLAMBA", "", "", "", "", "", "TOURISM ATTRACTION VISITOR RECORD (VAR 1)"]);
  aoa.push(["PROVINCE OF SARANGANI", "", "", "", "", "", "(Excursionist / Day Tour Guest)"]);
  aoa.push([]);
  aoa.push(["Name of Attraction/ Tourist Site:", "Tuka Marine Park"]);
  aoa.push(["Type of Tourist Attraction:", "Marine Park"]);
  aoa.push(["Tourist Code:", ""]);
  aoa.push(["Month:", monthLabel(year, month)]);
  aoa.push(["Municipality:", "Klamba"]);
  aoa.push([]);
  aoa.push([
    "Date",
    "Place of Residence", "", "", "", "", "",
    "Foreign Country Residence", "", "",
    "Grand Total Number of Visitors", "", "",
  ]);
  aoa.push([
    "",
    "Philippines", "", "", "", "", "",
    "", "", "",
    "", "", "",
  ]);
  aoa.push([
    "",
    "This Province", "", "",
    "Other Province", "", "",
    "", "", "",
    "", "", "",
  ]);
  aoa.push([
    "",
    "Male", "Female", "Total",
    "Male", "Female", "Total",
    "Male", "Female", "Total",
    "Male", "Female", "Total",
  ]);

  const firstData = aoa.length + 1;
  for (let d = 1; d <= 31; d++) {
    const excelRow = firstData + d - 1;
    if (d > dim) {
      aoa.push([d, "", "", "", "", "", "", "", "", "", "", "", ""]);
      continue;
    }
    const x = days[d - 1];
    aoa.push([
      d,
      x.inM,
      x.inF,
      { t: "n", f: `B${excelRow}+C${excelRow}` },
      x.outM,
      x.outF,
      { t: "n", f: `E${excelRow}+F${excelRow}` },
      x.forM,
      x.forF,
      { t: "n", f: `H${excelRow}+I${excelRow}` },
      { t: "n", f: `B${excelRow}+E${excelRow}+H${excelRow}` },
      { t: "n", f: `C${excelRow}+F${excelRow}+I${excelRow}` },
      { t: "n", f: `K${excelRow}+L${excelRow}` },
    ]);
  }
  const lastData = firstData + 30;
  const totalRow = lastData + 1;
  aoa.push([
    "TOTAL",
    { t: "n", f: `SUM(B${firstData}:B${lastData})` },
    { t: "n", f: `SUM(C${firstData}:C${lastData})` },
    { t: "n", f: `SUM(D${firstData}:D${lastData})` },
    { t: "n", f: `SUM(E${firstData}:E${lastData})` },
    { t: "n", f: `SUM(F${firstData}:F${lastData})` },
    { t: "n", f: `SUM(G${firstData}:G${lastData})` },
    { t: "n", f: `SUM(H${firstData}:H${lastData})` },
    { t: "n", f: `SUM(I${firstData}:I${lastData})` },
    { t: "n", f: `SUM(J${firstData}:J${lastData})` },
    { t: "n", f: `SUM(K${firstData}:K${lastData})` },
    { t: "n", f: `SUM(L${firstData}:L${lastData})` },
    { t: "n", f: `SUM(M${firstData}:M${lastData})` },
  ]);
  aoa.push(["VAR FORM (Revised)"]);
  aoa.push([]);
  aoa.push(["Submitted by:", ""]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 6 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 6 }, e: { r: 1, c: 12 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 6 } },
    { s: { r: 4, c: 1 }, e: { r: 4, c: 6 } },
    { s: { r: 5, c: 1 }, e: { r: 5, c: 6 } },
    { s: { r: 6, c: 1 }, e: { r: 6, c: 6 } },
    { s: { r: 7, c: 1 }, e: { r: 7, c: 6 } },
    { s: { r: 9, c: 1 }, e: { r: 9, c: 6 } },
    { s: { r: 9, c: 7 }, e: { r: 11, c: 9 } },
    { s: { r: 9, c: 10 }, e: { r: 11, c: 12 } },
    { s: { r: 9, c: 0 }, e: { r: 12, c: 0 } },
    { s: { r: 10, c: 1 }, e: { r: 10, c: 6 } },
    { s: { r: 11, c: 1 }, e: { r: 11, c: 3 } },
    { s: { r: 11, c: 4 }, e: { r: 11, c: 6 } },
  ];
  ws["!cols"] = Array.from({ length: 13 }, (_, i) => ({ wch: i === 0 ? 12 : 10 }));
  applyBorders(ws, 9, 0, 12 + 32, 12);
  void totalRow;
  return ws;
}

function peso(n) {
  return Number(n || 0);
}

function buildProfitSheet({ from, to, reservations, billingById }) {
  const aoa = [];
  aoa.push(["TUKA MARINE PARK — PROFIT SUMMARY"]);
  aoa.push(["Selected duration:", `${from} to ${to}`]);
  aoa.push([]);
  aoa.push([
    "Reservation ID",
    "Date",
    "Guest",
    "Stay",
    "Reference No.",
    "Status",
    "Guest fees",
    "Accommodation",
    "Additional charges",
    "Charge details",
    "Down payment",
    "Amount due",
  ]);

  const rows = reservations
    .filter((r) => r.status !== "cancelled")
    .filter((r) => {
      const d = String(r.reservationDate || "").slice(0, 10);
      return (!from || d >= from) && (!to || d <= to);
    })
    .sort((a, b) => String(a.reservationDate).localeCompare(String(b.reservationDate)) || Number(a.reservationNo) - Number(b.reservationNo));

  let guestSum = 0;
  let unitSum = 0;
  let extraSum = 0;
  let downSum = 0;
  let dueSum = 0;

  for (const r of rows) {
    const bill = billingById[r.id] || {};
    const charges = bill.additionalCharges || [];
    const guest = peso(bill.guestTotal);
    const unit = peso(bill.unitTotal);
    const extra = peso(bill.additionalTotal ?? charges.reduce((s, c) => s + Number(c.amount || 0), 0));
    const down = peso(bill.downPayment);
    const due = peso(bill.finalAmount);
    guestSum += guest;
    unitSum += unit;
    extraSum += extra;
    downSum += down;
    dueSum += due;
    aoa.push([
      r.reservationNo ?? "",
      r.reservationDate || "",
      r.reservedBy || "",
      r.stayType || "",
      r.referenceNo || "",
      r.status || "",
      guest,
      unit,
      extra,
      charges.map((c) => `${c.name} (${Number(c.amount || 0).toFixed(2)})`).join("; "),
      down,
      due,
    ]);
  }

  aoa.push([]);
  aoa.push([
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    guestSum,
    unitSum,
    extraSum,
    "",
    downSum,
    dueSum,
  ]);
  aoa.push([]);
  aoa.push(["Profit components (selected duration)"]);
  aoa.push(["Guests", guestSum]);
  aoa.push(["Accommodation", unitSum]);
  aoa.push(["Additional charges", extraSum]);
  aoa.push(["Gross (guests + accommodation + additional)", guestSum + unitSum + extraSum]);
  aoa.push(["Down payments collected", downSum]);
  aoa.push(["Net amount due", dueSum]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }];
  ws["!cols"] = [
    { wch: 16 },
    { wch: 12 },
    { wch: 22 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 36 },
    { wch: 14 },
    { wch: 14 },
  ];
  return ws;
}

export function exportGovernmentReports({
  year,
  month,
  from,
  to,
  reservations,
  guestCountsById,
  billingById = {},
  unitsByResId = {},
}) {
  const y = Number(year);
  const m = Number(month);
  const rangeFrom = from || `${y}-${pad(m)}-01`;
  const rangeTo = to || `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    buildOvernightSheet({ year: y, month: m, reservations, guestCountsById, unitsByResId }),
    "Overnight Tourist"
  );
  XLSX.utils.book_append_sheet(
    wb,
    buildVar1Sheet({ year: y, month: m, reservations, guestCountsById }),
    "VAR 1 Day Tour"
  );
  XLSX.utils.book_append_sheet(
    wb,
    buildProfitSheet({ from: rangeFrom, to: rangeTo, reservations, billingById }),
    "Profit Summary"
  );

  const filename = `Tuka-Marine-Park-Reports-${rangeFrom}-to-${rangeTo}.xlsx`;
  downloadWorkbook(wb, filename);
}

export { dateKey };
