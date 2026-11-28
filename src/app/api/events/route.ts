import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/adminGuard";
import { computeBayesianScoreboard } from "@/lib/stats/bayesian";
import {
  readExperimentStore,
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
      action?: "track" | "simulate";
      eventType?: "rewrite_copied" | "feedback_helpful";
      variant?: RoastStrategyVariant;
      unlockVariant?: UnlockFlowVariant;
      inputType?: InputType;
      feedId?: string;
      rating?: number;
      timeToCopyMs?: number;
      count?: number;
    };

    if (body.action === "simulate") {
      const denied = requireAdminAccess(request);
      if (denied) return denied;
    }

    const updatedStore = await withExperimentLock(async () => {
      const store = await readExperimentStore();

      if (body.action === "simulate") {
        const count = Math.min(Math.max(Number(body.count ?? 30), 4), 150);
        const inputTypes: InputType[] = ["github_readme", "resume_bullets", "project_pitch"];
        const levels: ExperienceLevel[] = ["student", "mid", "senior"];

        for (let i = 0; i < count; i += 1) {
          const totalW = store.weights.brutal_checklist + store.weights.guided_coach;
          const pickA =
            totalW <= 0 || Math.random() * totalW < store.weights.brutal_checklist;
          const variant: RoastStrategyVariant = pickA ? "brutal_checklist" : "guided_coach";

          const totalUW =
            store.unlockWeights.instant_reveal + store.unlockWeights.interactive_step;
          const pickInstant =
            totalUW <= 0 || Math.random() * totalUW < store.unlockWeights.instant_reveal;
          const unlockVariant: UnlockFlowVariant = pickInstant
            ? "instant_reveal"
            : "interactive_step";

          const inputType = inputTypes[i % inputTypes.length];
          const level = levels[i % levels.length];

          const bucket = store.variants[variant];
          bucket.exposures += 1;
          store.cohorts[inputType].variants[variant].exposures += 1;
          if (store.experienceCohorts?.[level]) {
            store.experienceCohorts[level].variants[variant].exposures += 1;
          }
          store.unlockVariants[unlockVariant].exposures += 1;

          const completed = Math.random() < (pickA ? 0.93 : 0.84);
          if (completed) bucket.completions += 1;

          const copyBase =
            level === "student"
              ? pickA
                ? 0.44
                : 0.56
              : pickA
                ? 0.58
                : 0.37;
          const copied = completed && Math.random() < copyBase;
          if (copied) {
            bucket.rewriteCopies += 1;
            bucket.totalTimeToCopyMs += pickA
              ? 4200 + Math.round(Math.random() * 3500)
              : 8500 + Math.round(Math.random() * 5000);
            store.cohorts[inputType].variants[variant].rewriteCopies += 1;
            if (store.experienceCohorts?.[level]) {
              store.experienceCohorts[level].variants[variant].rewriteCopies += 1;
            }
            store.unlockVariants[unlockVariant].rewriteCopies += 1;
          }

          if (Math.random() < 0.45) {
            const r = pickA
              ? Math.random() < 0.72
                ? 5
                : 4
              : Math.random() < 0.65
                ? 5
                : 4;
            bucket.ratingSum += r;
            bucket.ratingCount += 1;
            if (r >= 4) bucket.helpfulVotes += 1;
          }

          if (i < 3) {
            store.recentFeed = [
              {
                id: `sim-${Date.now()}-${i}`,
                timestamp: new Date().toISOString(),
                inputType,
                experienceLevel: level,
                variant,
                unlockVariant,
                trafficSource: "simulated" as const,
                score: 58 + Math.round(Math.random() * 32),
                copiedRewrite: copied,
                rating: copied ? 5 : 4,
              },
              ...store.recentFeed,
            ].slice(0, 25);
          }
        }

        await writeExperimentStore(store);
        return store;
      }

      const variant: RoastStrategyVariant =
        body.variant === "guided_coach" ? "guided_coach" : "brutal_checklist";
      const unlockVariant: UnlockFlowVariant =
        body.unlockVariant === "interactive_step" ? "interactive_step" : "instant_reveal";
      const inputType: InputType =
        body.inputType === "resume_bullets" || body.inputType === "project_pitch"
          ? body.inputType
          : "github_readme";

      const counter = store.variants[variant];
      const feedRow = body.feedId
        ? store.recentFeed.find((f) => f.id === body.feedId)
        : undefined;

      if (body.eventType === "rewrite_copied") {
        if (!feedRow || !feedRow.copiedRewrite) {
          counter.rewriteCopies += 1;
          counter.totalTimeToCopyMs += Math.min(
            Math.max(Number(body.timeToCopyMs ?? 5200), 500),
            120_000
          );
          store.unlockVariants[unlockVariant].rewriteCopies += 1;
          if (store.cohorts[inputType]) {
            store.cohorts[inputType].variants[variant].rewriteCopies += 1;
          }
          const expLevel = feedRow?.experienceLevel;
          if (expLevel && store.experienceCohorts?.[expLevel]) {
            store.experienceCohorts[expLevel].variants[variant].rewriteCopies += 1;
          }
          if (feedRow) feedRow.copiedRewrite = true;
        }
      } else if (body.eventType === "feedback_helpful") {
        const rating = Math.min(Math.max(Math.round(Number(body.rating ?? 5)), 1), 5);
        if (feedRow && feedRow.rating !== null) {
          const prev = feedRow.rating;
          counter.ratingSum = Math.max(0, counter.ratingSum - prev + rating);
          if (prev < 4 && rating >= 4) counter.helpfulVotes += 1;
          else if (prev >= 4 && rating < 4) {
            counter.helpfulVotes = Math.max(0, counter.helpfulVotes - 1);
          }
          feedRow.rating = rating;
        } else {
          counter.ratingSum += rating;
          counter.ratingCount += 1;
          if (rating >= 4) counter.helpfulVotes += 1;
          if (feedRow) feedRow.rating = rating;
        }
      }

      await writeExperimentStore(store);
      return store;
    });

    return NextResponse.json({
      ok: true,
      store: updatedStore,
      scoreboard: computeBayesianScoreboard(updatedStore),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to track event" },
      { status: 500 }
    );
  }
}
