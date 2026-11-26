import { NextResponse, connection } from "next/server";
import { computeBayesianScoreboard } from "@/lib/stats/bayesian";
import {
  buildFlagsmithSdkState,
  getPublicConnectionStatus,
  readExperimentStore,
  readRuntimeConfig,
  resetExperimentStore,
  withExperimentLock,
  writeExperimentStore,
} from "@/lib/store/experimentStore";
import type { ExperienceLevel, InputType } from "@/lib/types";

export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  const visitorId = searchParams.get("visitorId") || "dev_visitor_01";
  const inputType = (searchParams.get("inputType") as InputType) || "github_readme";
  const experienceLevel =
    (searchParams.get("experienceLevel") as ExperienceLevel) || "mid";
  const role = searchParams.get("role") || "Full-Stack Developer";

  const [store, cfg] = await Promise.all([
    readExperimentStore(),
    readRuntimeConfig(),
  ]);

  const scoreboard = computeBayesianScoreboard(store);
  const sdkState = buildFlagsmithSdkState({
    visitorId,
    traits: { role, experience_level: experienceLevel, input_type: inputType },
    store,
    sdkApiUrl: cfg.flagsmithSdkApiUrl,
  });

  return NextResponse.json({
    connection: getPublicConnectionStatus(cfg),
    store,
    scoreboard,
    sdkState,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "reset" | "update_weights" | "toggle_scoreboard";
      mode?: "baseline" | "zero";
      brutalWeight?: number;
      scoreboardEnabled?: boolean;
    };

    if (body.action === "reset") {
      const store = await resetExperimentStore(body.mode === "zero" ? "zero" : "baseline");
      return NextResponse.json({
        ok: true,
        store,
        scoreboard: computeBayesianScoreboard(store),
      });
    }

    if (body.action === "update_weights") {
      const w = Math.max(0, Math.min(100, Math.round(Number(body.brutalWeight ?? 50))));
      const updated = await withExperimentLock(async () => {
        const store = await readExperimentStore();
        store.weights = {
          brutal_checklist: w,
          guided_coach: 100 - w,
        };
        await writeExperimentStore(store);
        return store;
      });
      return NextResponse.json({
        ok: true,
        store: updated,
        scoreboard: computeBayesianScoreboard(updated),
      });
    }

    if (body.action === "toggle_scoreboard") {
      const updated = await withExperimentLock(async () => {
        const store = await readExperimentStore();
        store.scoreboardEnabled =
          typeof body.scoreboardEnabled === "boolean"
            ? body.scoreboardEnabled
            : !store.scoreboardEnabled;
        await writeExperimentStore(store);
        return store;
      });
      return NextResponse.json({
        ok: true,
        store: updated,
        scoreboard: computeBayesianScoreboard(updated),
      });
    }

    return NextResponse.json({ error: "Unsupported state action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "State action failed" },
      { status: 500 }
    );
  }
}
