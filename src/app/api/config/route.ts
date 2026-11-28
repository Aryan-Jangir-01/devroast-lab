import { NextResponse, connection } from "next/server";
import { requireAdminAccess } from "@/lib/auth/adminGuard";
import {
  getPublicConnectionStatus,
  provisionFlagsInFlagsmithCloud,
  readRuntimeConfig,
  saveRuntimeConfig,
} from "@/lib/store/experimentStore";

export async function GET() {
  await connection();
  const cfg = await readRuntimeConfig();
  return NextResponse.json({ connection: getPublicConnectionStatus(cfg) });
}

export async function POST(request: Request) {
  const denied = requireAdminAccess(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const pick = (k: string): string | undefined =>
      typeof body[k] === "string" ? (body[k] as string).trim() : undefined;

    if (body.action === "provision_flags") {
      let cfg = await readRuntimeConfig();
      const inlineApiKey = pick("flagsmithApiKey");
      const inlineProjectId = pick("flagsmithProjectId");
      if (inlineApiKey || inlineProjectId) {
        cfg = await saveRuntimeConfig({
          ...(inlineApiKey ? { flagsmithApiKey: inlineApiKey } : {}),
          ...(inlineProjectId ? { flagsmithProjectId: inlineProjectId } : {}),
        });
      }
      const result = await provisionFlagsInFlagsmithCloud(cfg);
      return NextResponse.json({
        ok: result.errors.length === 0,
        ...result,
        connection: getPublicConnectionStatus(cfg),
      });
    }

    const updated = await saveRuntimeConfig({
      flagsmithApiUrl: pick("flagsmithApiUrl") || undefined,
      flagsmithSdkApiUrl: pick("flagsmithSdkApiUrl") || undefined,
      publicFlagsmithEnvKey: pick("publicFlagsmithEnvKey"),
      flagsmithApiKey: pick("flagsmithApiKey") || undefined,
      flagsmithProjectId: pick("flagsmithProjectId"),
      flagsmithEnvKey: pick("flagsmithEnvKey") || undefined,
      geminiApiKey: pick("geminiApiKey") || undefined,
      openaiApiKey: pick("openaiApiKey") || undefined,
      anthropicApiKey: pick("anthropicApiKey") || undefined,
    });

    return NextResponse.json({
      ok: true,
      connection: getPublicConnectionStatus(updated),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configuration error" },
      { status: 400 }
    );
  }
}
