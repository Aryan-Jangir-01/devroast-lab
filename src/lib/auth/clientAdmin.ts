const ADMIN_STORAGE_KEY = "devroast_admin_key";

export function getStoredAdminKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(ADMIN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredAdminKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    if (key.trim()) {
      window.sessionStorage.setItem(ADMIN_STORAGE_KEY, key.trim());
    } else {
      window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
}

export function buildAdminHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const adminKey = getStoredAdminKey();
  if (adminKey) {
    headers["x-devroast-admin-key"] = adminKey;
  }
  return headers;
}
