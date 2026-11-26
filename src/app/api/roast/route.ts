import { NextResponse } from "next/server";
import { analyzeSubmission } from "@/lib/analyzer/roastEngine";
import { computeBayesianScoreboard } from "@/lib/stats/bayesian";
import {
  readExperimentStore,
  readRuntimeConfig,
  withExperimentLock,
  writeExperimentStore,
} from "@/lib/store/experimentStore";
import type {
  ExperienceLevel,
  InputType,
  RoastStrategyVariant,
  UnlockFlowVariant,
} from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      inputType?: InputType;
      role?: string;
      experienceLevel?: ExperienceLevel;
      variant?: RoastStrategyVariant;
      unlockVariant?: UnlockFlowVariant;
    };

    const text = body.text?.trim() ?? "";
    if (text.length < 15) {
      return NextResponse.json(
        { error: "Paste at least 15 characters of a README, Resume, or Pitch to analyze." },
        { status: 400 }
      );
    }

    const inputType: InputType =
      body.inputType === "resume_bullets" || body.inputType === "project_pitch"
        ? body.inputType
        : "github_readme";
    const experienceLevel: ExperienceLevel =
      body.experienceLevel === "student" || body.experienceLevel === "senior"
        ? body.experienceLevel
        : "mid";
    const role = body.role?.trim() || "Full-Stack Developer";
    const variant: RoastStrategyVariant =
      body.variant === "guided_coach" ? "guided_coach" : "brutal_checklist";
    const unlockVariant: UnlockFlowVariant =
      body.unlockVariant === "interactive_step" ? "interactive_step" : "instant_reveal";

    const config = await readRuntimeConfig();
    const analysis = await analyzeSubmission({
      text,
      inputType,
      role,
      experienceLevel,
      config,
    });

    const feedId = `roast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const updatedStore = await withExperimentLock(async () => {
      const store = await readExperimentStore();
      const counter = store.variants[variant];
      counter.exposures += 1;
      counter.completions += 1;

      store.unlockVariants[unlockVariant].exposures += 1;

      if (store.cohorts[inputType]) {
        store.cohorts[inputType].variants[variant].exposures += 1;
      }

      if (store.experienceCohorts?.[experienceLevel]) {
        store.experienceCohorts[experienceLevel].variants[variant].exposures += 1;
      }

      store.recentFeed = [
        {
          id: feedId,
          timestamp: new Date().toISOString(),
          inputType,
          experienceLevel,
          role,
          variant,
          unlockVariant,
          trafficSource: "live" as const,
          score: analysis.overallScore,
          copiedRewrite: false,
          rating: null,
        },
        ...store.recentFeed,
      ].slice(0, 25);

      await writeExperimentStore(store);
      return store;
    });

    return NextResponse.json({
      ok: true,
      feedId,
      variant,
      analysis,
      scoreboard: computeBayesianScoreboard(updatedStore),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to analyze submission" },
      { status: 500 }
    );
  }
}
