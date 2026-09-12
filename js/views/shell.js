import { isDirty } from "../dirty.js";
import { clearSession, getSession, isAdmin } from "../session.js";
import { exportBackup } from "../backup.js";
import { renderDashboard } from "./dashboard.js";
import { renderReservations } from "./reservations.js";
import { renderTransactions } from "./transactions.js";
import { renderSettings } from "./settings.js";

export function renderShell(root, { onLogout } = {}) {
  const session = getSession();
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <img class="brand-mark" src="img/klamba-seal.png" alt="Municipality of Klamba seal" />
          <div>
            <h1>Tuka Marine Park</h1>
            <small>Resort MIS · Web Edition</small>
          </div>
        </div>
        <nav class="nav">
          <button data-view="dashboard" class="active">Dashboard</button>
          <button data-view="reservations">Reservations</button>
          <button data-view="transactions">Transactions</button>
          <button data-view="settings">Settings</button>
        </nav>
        <div class="session-chip">
          <span>${escape(session.loggedInUsername)} · ${escape(session.loggedInRole)}${isAdmin() ? "" : ""}</span>
          <button class="btn ghost" type="button" id="logout" style="color:#edf7f5;border-color:rgba(255,255,255,.2)">Sign out</button>
        </div>
      </header>
      <main id="app-content"></main>
    </div>
  `;

  const content = root.querySelector("#app-content");
  const navBtns = [...root.querySelectorAll(".nav [data-view]")];
  let current = null;
  let viewName = "dashboard";

  function setActive(name) {
    navBtns.forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  }

  async function show(name, params = {}) {
    current?.cleanup?.();
    viewName = name;
    setActive(name === "dashboard" ? "dashboard" : name);
    if (name === "dashboard") {
      current = renderDashboard(content, {
        reservationId: params.reservationId || null,
        onAfterSave: () => {},
      });
    } else if (name === "reservations") {
      current = renderReservations(content, {
        onEdit: (id) => show("dashboard", { reservationId: id }),
      });
    } else if (name === "transactions") {
      current = renderTransactions(content);
    } else {
      current = renderSettings(content);
    }
  }

  navBtns.forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

  function onBeforeUnload(e) {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = "";
  }

  async function signOut() {
    if (isDirty()) {
      const exportNow = confirm("There are data changes since the last backup. Download a JSON backup before signing out?");
      if (exportNow) await exportBackup();
    }
    window.removeEventListener("beforeunload", onBeforeUnload);
    current?.cleanup?.();
    current = null;
    clearSession();
    if (typeof onLogout === "function") {
      onLogout();
      return;
    }
    location.reload();
  }

  root.querySelector("#logout").addEventListener("click", () => {
    signOut().catch((err) => {
      console.error(err);
      alert(err.message || "Could not sign out.");
    });
  });
  window.addEventListener("beforeunload", onBeforeUnload);

  show("dashboard");

  return {
    show,
    cleanup() {
      current?.cleanup?.();
      window.removeEventListener("beforeunload", onBeforeUnload);
    },
  };
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
