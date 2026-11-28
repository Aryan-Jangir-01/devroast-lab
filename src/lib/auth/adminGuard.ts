import crypto from "node:crypto";
import { NextResponse } from "next/server";

export function getConfiguredAdminKey(): string {
  return (process.env.DEVROAST_ADMIN_KEY ?? "").trim();
}

export function isAdminProtected(): boolean {
  return getConfiguredAdminKey().length > 0;
}

export function isAdminSecretValid(candidate: string | null | undefined): boolean {
  const configured = getConfiguredAdminKey();
  if (!configured) return true;
  if (!candidate) return false;

  const a = Buffer.from(configured, "utf8");
  const b = Buffer.from(candidate.trim(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Guards privileged endpoints (reset, traffic simulate, Flagsmith weight mutation,
 * and runtime credential updates) when DEVROAST_ADMIN_KEY is configured.
 */
export function requireAdminAccess(request: Request): NextResponse | null {
  if (!isAdminProtected()) return null;
  const headerKey = request.headers.get("x-devroast-admin-key");
  if (isAdminSecretValid(headerKey)) return null;

  return NextResponse.json(
    {
      error:
        "Admin passcode required. Unlock Admin Mode in the UI or provide x-devroast-admin-key.",
    },
    { status: 401 }
  );
}
