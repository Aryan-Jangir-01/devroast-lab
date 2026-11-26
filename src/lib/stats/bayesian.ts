import type {
  BayesianScoreboard,
  BayesianVariantMetrics,
  CohortComparisonRow,
  CohortCounter,
  ExperimentStoreData,
  RoastStrategyVariant,
  UnlockFlowVariant,
  UnlockVariantMetrics,
} from "@/lib/types";

const MONTE_CARLO_DRAWS = 4000;
const MIN_SAMPLES_PER_ARM = 20;

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleGamma(shape: number, rand: () => number): number {
  if (shape <= 0) return 0;
  if (shape < 1) {
    const u = Math.max(rand(), 1e-12);
    return sampleGamma(shape + 1, rand) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 64; i += 1) {
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const v = Math.pow(1 + c * z, 3);
    if (v <= 0) continue;
    const u = Math.max(rand(), 1e-12);
    if (u < 1 - 0.0331 * Math.pow(z, 4)) return d * v;
    if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) return d * v;
  }
  return shape;
}

function sampleBeta(alpha: number, beta: number, rand: () => number): number {
  const x = sampleGamma(alpha, rand);
  const y = sampleGamma(beta, rand);
  return x + y === 0 ? 0.5 : x / (x + y);
}

function roundTo(n: number, decimals = 4): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function runTwoArmBetaSimulation(params: {
  successA: number;
  trialsA: number;
  successB: number;
  trialsB: number;
  draws: number;
  rand: () => number;
}) {
  const { successA, trialsA, successB, trialsB, draws, rand } = params;
  const samplesA = new Array<number>(draws);
  const samplesB = new Array<number>(draws);
  let winsA = 0;
  let winsB = 0;

  for (let i = 0; i < draws; i += 1) {
    const thetaA = sampleBeta(
      Math.max(0, successA) + 1,
      Math.max(0, trialsA - successA) + 1,
      rand
    );
    const thetaB = sampleBeta(
      Math.max(0, successB) + 1,
      Math.max(0, trialsB - successB) + 1,
      rand
    );
    samplesA[i] = thetaA;
    samplesB[i] = thetaB;
    if (thetaA >= thetaB) winsA += 1;
    else winsB += 1;
  }

  return {
    samplesA,
    samplesB,
    chanceA: roundTo(winsA / draws, 4),
    chanceB: roundTo(winsB / draws, 4),
  };
}

function mapCohortRows(
  cohorts: Record<string, CohortCounter> | undefined
): CohortComparisonRow[] {
  if (!cohorts) return [];
  return Object.values(cohorts).map((c) => {
    const a = c.variants.brutal_checklist;
    const b = c.variants.guided_coach;
    return {
      cohortKey: c.cohortKey,
      label: c.label,
      brutalCopyRate: a.exposures > 0 ? roundTo(a.rewriteCopies / a.exposures, 3) : 0,
      coachCopyRate: b.exposures > 0 ? roundTo(b.rewriteCopies / b.exposures, 3) : 0,
      brutalExposures: a.exposures,
      coachExposures: b.exposures,
    };
  });
}

function computeSrmCheck(
  exposuresA: number,
  exposuresB: number,
  weightA: number,
  weightB: number
) {
  const total = exposuresA + exposuresB;
  const totalW = weightA + weightB;
  const expectedShareA = totalW > 0 ? weightA / totalW : 0.5;
  const actualSplitA = total > 0 ? roundTo(exposuresA / total, 4) : roundTo(expectedShareA, 4);

  if (total < 20 || expectedShareA <= 0 || expectedShareA >= 1) {
    return {
      expectedSplitA: roundTo(expectedShareA, 4),
      actualSplitA,
      chiSquare: 0,
      hasMismatch: false,
    };
  }

  const expA = total * expectedShareA;
  const expB = total * (1 - expectedShareA);
  const chiSquare =
    Math.pow(exposuresA - expA, 2) / expA + Math.pow(exposuresB - expB, 2) / expB;

  return {
    expectedSplitA: roundTo(expectedShareA, 4),
    actualSplitA,
    chiSquare: roundTo(chiSquare, 3),
    hasMismatch: chiSquare >= 6.635,
  };
}

export function computeBayesianScoreboard(
  store: ExperimentStoreData,
  options?: { seed?: number; draws?: number }
): BayesianScoreboard {
  const draws = options?.draws ?? MONTE_CARLO_DRAWS;
  const keys: RoastStrategyVariant[] = ["brutal_checklist", "guided_coach"];
  const labels: Record<RoastStrategyVariant, string> = {
    brutal_checklist: "Variant A · Brutal Checklist",
    guided_coach: "Variant B · Guided Coach",
  };

  const a = store.variants.brutal_checklist;
  const b = store.variants.guided_coach;
  const uA = store.unlockVariants?.instant_reveal ?? { exposures: 0, rewriteCopies: 0 };
  const uB = store.unlockVariants?.interactive_step ?? { exposures: 0, rewriteCopies: 0 };

  const seedStr = [
    `a:${a.exposures}:${a.rewriteCopies}:${a.completions}`,
    `b:${b.exposures}:${b.rewriteCopies}:${b.completions}`,
    `ua:${uA.exposures}:${uA.rewriteCopies}`,
    `ub:${uB.exposures}:${uB.rewriteCopies}`,
  ].join("|");

  const rand = createSeededRng(options?.seed ?? hashString(seedStr));
  const primarySim = runTwoArmBetaSimulation({
    successA: a.rewriteCopies,
    trialsA: a.exposures,
    successB: b.rewriteCopies,
    trialsB: b.exposures,
    draws,
    rand,
  });

  const samples: Record<RoastStrategyVariant, number[]> = {
    brutal_checklist: primarySim.samplesA,
    guided_coach: primarySim.samplesB,
  };
  const chances: Record<RoastStrategyVariant, number> = {
    brutal_checklist: primarySim.chanceA,
    guided_coach: primarySim.chanceB,
  };

  const controlCopyRate = a.exposures > 0 ? a.rewriteCopies / a.exposures : 0;

  const variants: BayesianVariantMetrics[] = keys.map((key) => {
    const v = store.variants[key];
    const sorted = [...samples[key]].sort((x, y) => x - y);
    const low = sorted[Math.floor(draws * 0.025)];
    const high = sorted[Math.min(draws - 1, Math.floor(draws * 0.975))];

    const copyConversionRate = v.exposures > 0 ? v.rewriteCopies / v.exposures : 0;
    const completionRate = v.exposures > 0 ? v.completions / v.exposures : 0;
    const helpfulRate = v.ratingCount > 0 ? v.helpfulVotes / v.ratingCount : 0;
    const avgHelpfulness = v.ratingCount > 0 ? v.ratingSum / v.ratingCount : 0;
    const avgTimeToCopyMs =
      v.rewriteCopies > 0 ? Math.round(v.totalTimeToCopyMs / v.rewriteCopies) : 0;

    let lift = 0;
    if (key !== "brutal_checklist" && controlCopyRate > 0) {
      lift = ((copyConversionRate - controlCopyRate) / controlCopyRate) * 100;
    }

    return {
      variant: key,
      label: labels[key],
      trafficPercent: store.weights[key],
      exposures: v.exposures,
      completions: v.completions,
      rewriteCopies: v.rewriteCopies,
      helpfulVotes: v.helpfulVotes,
      ratingCount: v.ratingCount,
      completionRate: roundTo(completionRate, 4),
      copyConversionRate: roundTo(copyConversionRate, 4),
      helpfulRate: roundTo(helpfulRate, 4),
      avgHelpfulness: roundTo(avgHelpfulness, 2),
      avgTimeToCopyMs,
      chanceToWin: chances[key],
      liftVsControlPercent: roundTo(lift, 1),
      credibleInterval95: [roundTo(low, 4), roundTo(high, 4)],
    };
  });

  const leader =
    variants[0].chanceToWin >= variants[1].chanceToWin ? variants[0] : variants[1];
  const totalExposures = a.exposures + b.exposures;
  const totalCopies = a.rewriteCopies + b.rewriteCopies;
  const minSamplesObserved = Math.min(a.exposures, b.exposures);
  const samplesNeeded = Math.max(0, MIN_SAMPLES_PER_ARM - minSamplesObserved);
  const winnerConfidenceMet =
    leader.chanceToWin >= 0.9 && minSamplesObserved >= MIN_SAMPLES_PER_ARM;

  const summary = winnerConfidenceMet
    ? `${leader.label} leads with ${(leader.chanceToWin * 100).toFixed(1)}% Bayesian win probability (${(leader.copyConversionRate * 100).toFixed(1)}% rewrite copy conversion).`
    : minSamplesObserved < MIN_SAMPLES_PER_ARM
      ? `Collecting minimum sample gate (${minSamplesObserved}/${MIN_SAMPLES_PER_ARM} per arm): ${leader.label} currently leads at ${(leader.chanceToWin * 100).toFixed(1)}% chance to win.`
      : `Experiment running: ${leader.label} currently leads (${(leader.chanceToWin * 100).toFixed(1)}% chance to win across ${totalExposures} exposures).`;

  const unlockSim = runTwoArmBetaSimulation({
    successA: uA.rewriteCopies,
    trialsA: uA.exposures,
    successB: uB.rewriteCopies,
    trialsB: uB.exposures,
    draws: Math.min(draws, 2000),
    rand,
  });

  const unlockVariants: UnlockVariantMetrics[] = [
    {
      variant: "instant_reveal",
      label: "Instant Reveal",
      trafficPercent: store.unlockWeights?.instant_reveal ?? 50,
      exposures: uA.exposures,
      rewriteCopies: uA.rewriteCopies,
      copyConversionRate:
        uA.exposures > 0 ? roundTo(uA.rewriteCopies / uA.exposures, 4) : 0,
      chanceToWin: unlockSim.chanceA,
    },
    {
      variant: "interactive_step",
      label: "Interactive Reveal Gate",
      trafficPercent: store.unlockWeights?.interactive_step ?? 50,
      exposures: uB.exposures,
      rewriteCopies: uB.rewriteCopies,
      copyConversionRate:
        uB.exposures > 0 ? roundTo(uB.rewriteCopies / uB.exposures, 4) : 0,
      chanceToWin: unlockSim.chanceB,
    },
  ];
  const unlockLeader: UnlockFlowVariant =
    unlockVariants[0].chanceToWin >= unlockVariants[1].chanceToWin
      ? "instant_reveal"
      : "interactive_step";

  return {
    experimentKey: "roast_strategy_experiment",
    primaryMetric: "rewrite_copied",
    totalExposures,
    totalCopies,
    leadingVariant: leader.variant,
    winnerConfidenceMet,
    minSamplesPerArmTarget: MIN_SAMPLES_PER_ARM,
    minSamplesObserved,
    samplesNeeded,
    sampleRatioMismatch: computeSrmCheck(
      a.exposures,
      b.exposures,
      store.weights.brutal_checklist,
      store.weights.guided_coach
    ),
    summary,
    variants,
    unlockExperiment: {
      experimentKey: "rewrite_unlock_flow",
      leadingVariant: unlockLeader,
      variants: unlockVariants,
    },
    cohorts: mapCohortRows(store.cohorts),
    experienceCohorts: mapCohortRows(store.experienceCohorts),
  };
}
