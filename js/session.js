const KEY = "tuka.session";

const state = {
  loggedInUserId: null,
  loggedInUsername: null,
  loggedInRole: null,
};

function persist() {
  sessionStorage.setItem(KEY, JSON.stringify(state));
}

export function restoreSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed?.loggedInUserId == null || !parsed?.loggedInUsername) return false;
    Object.assign(state, parsed);
    return true;
  } catch {
    return false;
  }
}

export function setSession({ id, username, role }) {
  state.loggedInUserId = id;
  state.loggedInUsername = username;
  state.loggedInRole = role;
  persist();
}

export function clearSession() {
  state.loggedInUserId = null;
  state.loggedInUsername = null;
  state.loggedInRole = null;
  sessionStorage.removeItem(KEY);
}

export function getSession() {
  return { ...state };
}

export function isAdmin() {
  return state.loggedInRole === "admin";
}

export function isLoggedIn() {
  return state.loggedInUserId != null && Boolean(state.loggedInUsername);
}
