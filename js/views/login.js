import { sha256Hex } from "../hash.js";
import { getUserByUsername } from "../db.js";
import { setSession } from "../session.js";

export function renderLogin(container, { onSuccess }) {
  const recovery = new URLSearchParams(location.search).get("recovery") === "1";
  container.innerHTML = `
    <div class="login-screen">
      <form class="login-card" id="login-form">
        <img class="login-logo" src="img/klamba-seal.png" alt="Municipality of Klamba seal" />
        <div class="login-kicker">Tuka Marine Park</div>
        <h1>Sign in</h1>
        <p class="sub">Resort Management Information System — Web Edition</p>
        <div id="login-error" hidden class="alert"></div>
        <div class="field">
          <label for="username">Username</label>
          <input id="username" name="username" autocomplete="username" required />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
        </div>
        <button class="btn primary" type="submit" style="width:100%">Enter front desk</button>
        ${recovery ? `<button class="btn ghost" type="button" id="recovery-btn" style="width:100%;margin-top:8px">Recover as Admin</button>` : ""}
        <p class="hint">First run seeds an <strong>Admin</strong> account with password <strong>admin</strong>. Add <code>?recovery=1</code> to the URL only if local accounts are lost.</p>
      </form>
    </div>
  `;

  const errorEl = container.querySelector("#login-error");
  container.querySelector("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const username = container.querySelector("#username").value.trim();
    const password = container.querySelector("#password").value;
    const user = await getUserByUsername(username);
    if (!user || user.isActive === false) {
      errorEl.textContent = "Unknown or deactivated account.";
      errorEl.hidden = false;
      return;
    }
    const hash = await sha256Hex(password);
    if (hash !== user.passwordHash) {
      errorEl.textContent = "Incorrect password.";
      errorEl.hidden = false;
      return;
    }
    setSession({ id: user.id, username: user.username, role: user.role });
    onSuccess();
  });

  const rec = container.querySelector("#recovery-btn");
  if (rec) {
    rec.addEventListener("click", () => {
      setSession({ id: 0, username: "RecoveryAdmin", role: "admin" });
      onSuccess();
    });
  }

  return { cleanup() {} };
}
