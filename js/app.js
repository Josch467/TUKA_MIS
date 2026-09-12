import { ensureSeeded, persistStorage } from "./db.js";
import { isLoggedIn, restoreSession } from "./session.js";
import { renderLogin } from "./views/login.js";
import { renderShell } from "./views/shell.js";

const app = document.getElementById("app");
let active = null;

async function boot() {
  await persistStorage();
  await ensureSeeded();
  restoreSession();
  route();
}

function route() {
  active?.cleanup?.();
  if (!isLoggedIn()) {
    active = renderLogin(app, { onSuccess: route });
    return;
  }
  active = renderShell(app, { onLogout: route });
}

boot().catch((err) => {
  app.innerHTML = `<div class="login-screen"><div class="login-card"><h1>Could not start</h1><p>${err.message || err}</p><p class="hint">This app uses IndexedDB and ES modules. Open it through a local static server (not a raw file:// URL in some browsers).</p></div></div>`;
});
