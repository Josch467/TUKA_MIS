export const AGE_CATEGORIES = ["Children", "Adolescent", "Adult", "Senior_PWD"];
export const STAY_TYPES = ["Day Tour", "Overnight"];

export function isTentUnit(unit) {
  const name = String(unit?.unitName ?? unit?.name ?? "");
  return /tent/i.test(name);
}

export function paymentTypeFromReference(referenceNo) {
  return String(referenceNo ?? "").trim() ? "GCASH-CASH" : "CASH";
}

function rateFor(rates, stayType, category) {
  const match = (rates || []).find(
    (r) =>
      r.isActive !== false &&
      r.stayType === stayType &&
      r.category === category
  );
  return Number(match?.price ?? 0);
}

export function normalizeCharges(list = []) {
  return (list || [])
    .map((c) => ({
      name: String(c?.name ?? "").trim(),
      amount: Number(c?.amount ?? 0),
    }))
    .filter((c) => c.name);
}

export function computeBilling({
  guestCounts = {},
  units = [],
  rates = [],
  stayType = "Day Tour",
  downPayment = 0,
  discount = 0,
  additionalCharges = [],
} = {}) {
  const children = Number(guestCounts.children ?? 0);
  const adolescent = Number(guestCounts.adolescent ?? 0);
  const adult = Number(guestCounts.adult ?? 0);
  const seniorPwd = Number(guestCounts.seniorPwd ?? 0);

  const guestBreakdown = {
    Children: children * rateFor(rates, stayType, "Children"),
    Adolescent: adolescent * rateFor(rates, stayType, "Adolescent"),
    Adult: adult * rateFor(rates, stayType, "Adult"),
    Senior_PWD: seniorPwd * rateFor(rates, stayType, "Senior_PWD"),
  };

  const guestTotal = Object.values(guestBreakdown).reduce((s, n) => s + n, 0);
  const unitTotal = (units || []).reduce(
    (s, u) => s + Number(u.rateApplied ?? u.rate ?? 0),
    0
  );
  const charges = normalizeCharges(additionalCharges);
  const additionalTotal = charges.reduce((s, c) => s + c.amount, 0);
  const discountAmt = Number(discount ?? 0);
  const down = Number(downPayment ?? 0);
  const finalAmount = guestTotal + unitTotal + additionalTotal - discountAmt - down;

  return {
    guestTotal,
    unitTotal,
    additionalCharges: charges,
    additionalTotal,
    discount: discountAmt,
    downPayment: down,
    finalAmount,
    guestBreakdown,
    ratesUsed: {
      Children: rateFor(rates, stayType, "Children"),
      Adolescent: rateFor(rates, stayType, "Adolescent"),
      Adult: rateFor(rates, stayType, "Adult"),
      Senior_PWD: rateFor(rates, stayType, "Senior_PWD"),
    },
  };
}

export function formatPeso(n) {
  const value = Number(n ?? 0);
  return (
    "₱" +
    value.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function guestTotals(gc = {}) {
  const inMen = Number(gc.inMen ?? 0);
  const inWomen = Number(gc.inWomen ?? 0);
  const outMen = Number(gc.outMen ?? 0);
  const outWomen = Number(gc.outWomen ?? 0);
  const foreignMen = Number(gc.foreignMen ?? 0);
  const foreignWomen = Number(gc.foreignWomen ?? 0);
  const children = Number(gc.children ?? 0);
  const adolescent = Number(gc.adolescent ?? 0);
  const adult = Number(gc.adult ?? 0);
  const seniorPwd = Number(gc.seniorPwd ?? 0);
  const totalIn = inMen + inWomen;
  const totalOut = outMen + outWomen;
  const totalForeign = foreignMen + foreignWomen;
  const totalGuests = children + adolescent + adult + seniorPwd;
  return {
    ...gc,
    inMen,
    inWomen,
    outMen,
    outWomen,
    foreignMen,
    foreignWomen,
    children,
    adolescent,
    adult,
    seniorPwd,
    totalIn,
    totalOut,
    totalForeign,
    totalGuests,
  };
}

export function hasBillableGuests(gc) {
  return guestTotals(gc).totalGuests > 0;
}
