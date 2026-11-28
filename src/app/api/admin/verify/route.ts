import { NextResponse } from "next/server";
import { isAdminProtected, isAdminSecretValid } from "@/lib/auth/adminGuard";

export async function POST(request: Request) {
  try {
    if (!isAdminProtected()) {
      return NextResponse.json({ ok: true, adminProtected: false });
    }
    const body = (await request.json().catch(() => ({}))) as { key?: string };
    const candidate =
      body.key ?? request.headers.get("x-devroast-admin-key") ?? "";

    if (!isAdminSecretValid(candidate)) {
      return NextResponse.json(
        { ok: false, error: "Invalid admin passcode." },
        { status: 401 }
      );
    }

    return NextResponse.json({ ok: true, adminProtected: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to verify passcode." },
      { status: 400 }
    );
  }
}
