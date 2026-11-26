import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as roastPost } from "@/app/api/roast/route";
import { POST as eventsPost } from "@/app/api/events/route";
import { POST as githubReadmePost } from "@/app/api/github-readme/route";
import { computeBayesianScoreboard } from "@/lib/stats/bayesian";
import {
  assignStrategyForVisitor,
  readExperimentStore,
  resetExperimentStore,
} from "@/lib/store/experimentStore";

describe("DevRoast Lab analyzer, Bayesian scoreboard & API routes", () => {
  beforeEach(async () => {
    await resetExperimentStore("zero");
  });

  afterAll(async () => {
    await resetExperimentStore("baseline");
  });

  it("buckets visitors deterministically across multivariate variants", () => {
    const a1 = assignStrategyForVisitor("visitor_alpha", {
      brutal_checklist: 50,
      guided_coach: 50,
    });
    const a2 = assignStrategyForVisitor("visitor_alpha", {
      brutal_checklist: 50,
      guided_coach: 50,
    });
    expect(a1).toBe(a2);
  });

  it("analyzes real submission, tracks copy conversion, and deduplicates rating updates", async () => {
    const roastRes = await roastPost(
      new Request("http://localhost/api/roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Worked on a React and TypeScript dashboard for students. Made some APIs and helped with deployment.",
          inputType: "resume_bullets",
          role: "Frontend Engineer",
          experienceLevel: "student",
          variant: "brutal_checklist",
          unlockVariant: "interactive_step",
        }),
      })
    );
    expect(roastRes.status).toBe(200);
    const roastJson = (await roastRes.json()) as {
      ok: boolean;
      feedId: string;
      analysis: {
        overallScore: number;
        detectedStack: string[];
        redFlags: Array<{ id: string; beforeSnippet?: string }>;
        rewrittenText: string;
      };
    };
    expect(roastJson.ok).toBe(true);
    expect(roastJson.analysis.detectedStack).toContain("React");
    expect(roastJson.analysis.detectedStack).toContain("TypeScript");
    expect(roastJson.analysis.redFlags.some((r) => r.id === "missing-metrics")).toBe(true);
    expect(roastJson.analysis.rewrittenText.length).toBeGreaterThan(20);

    const copyRes = await eventsPost(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "track",
          eventType: "rewrite_copied",
          variant: "brutal_checklist",
          unlockVariant: "interactive_step",
          inputType: "resume_bullets",
          feedId: roastJson.feedId,
          timeToCopyMs: 4100,
        }),
      })
    );
    expect(copyRes.status).toBe(200);

    // Rate 5 stars then update to 3 stars on the same feedId -> count must stay 1
    await eventsPost(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "track",
          eventType: "feedback_helpful",
          variant: "brutal_checklist",
          feedId: roastJson.feedId,
          rating: 5,
        }),
      })
    );
    await eventsPost(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "track",
          eventType: "feedback_helpful",
          variant: "brutal_checklist",
          feedId: roastJson.feedId,
          rating: 3,
        }),
      })
    );

    const store = await readExperimentStore();
    const board = computeBayesianScoreboard(store, { seed: 7 });
    expect(board.totalExposures).toBe(1);
    expect(board.totalCopies).toBe(1);
    expect(board.variants[0].copyConversionRate).toBe(1);
    expect(board.variants[0].ratingCount).toBe(1);
    expect(board.variants[0].avgHelpfulness).toBe(3);
    expect(board.variants[0].helpfulVotes).toBe(0);
    expect(board.unlockExperiment.variants[1].exposures).toBe(1);
    expect(board.unlockExperiment.variants[1].rewriteCopies).toBe(1);
    expect(
      board.experienceCohorts.find((c) => c.cohortKey === "student")?.brutalExposures
    ).toBe(1);
  });

  it("rejects non-GitHub URLs cleanly on /api/github-readme", async () => {
    const res = await githubReadmePost(
      new Request("http://localhost/api/github-readme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "http://127.0.0.1:8080/internal" }),
      })
    );
    expect(res.status).toBe(400);
  });
});
