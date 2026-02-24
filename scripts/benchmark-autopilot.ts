import type { TestStep, UserSettings } from "../src/commons/types";
import { StorageKeys } from "../src/commons/types";
import { storageService } from "../src/commons/lib/storage";
import { AgentService } from "../src/core/application/AgentService";
import type {
  IDOMMarker,
  IInspector,
  ILLMProvider,
} from "../src/core/domain/interfaces";

const RUNS = 30;
const GOAL = 'Crea una cuenta, como si fueras Elon Musk y al final guarda.';

const DEFAULT_SETTINGS: UserSettings = {
  defaultDelay: 0,
  theme: "dark",
  language: "en",
  highlightColor: "#10B981",
  notificationsEnabled: true,
  enableAiForTesting: true,
  openRouterApiKey: "benchmark-key",
  agentMaxSteps: 20,
  agentMode: "strict_fail_fast",
  maxRetriesNonCritical: 1,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function step(
  action: TestStep["action"],
  order: number,
  targetId?: number,
  value?: string,
): TestStep {
  return {
    id: crypto.randomUUID(),
    action,
    selector: "body",
    targetId,
    value,
    delay: 0,
    order,
  };
}

async function seedSettings(overrides: Partial<UserSettings> = {}) {
  await (storageService as any).storage.set({
    [StorageKeys.SETTINGS]: { ...DEFAULT_SETTINGS, ...overrides },
  });
}

class BenchmarkInspector implements IInspector {
  async activateInspector(_profileId: string): Promise<void> {}

  async deactivateInspector(): Promise<void> {}

  async highlightElement(_selector: string, _message?: string): Promise<void> {}

  async getDistilledDOM(_profileId: string): Promise<string> {
    return "";
  }

  async executeStep(_step: TestStep): Promise<void> {}

  onElementCaptured(_callback: (info: any) => void): void {}

  onErrorCaptured(_callback: (error: any) => void): void {}
}

class BenchmarkDOMMarker implements IDOMMarker {
  private fields = {
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    role: "",
    teamSize: "",
    password: "",
    terms: false,
  };

  private committed = false;
  private readonly statusDelayMs: number;
  private commitAt: number | null = null;

  constructor(statusDelayMs: number) {
    this.statusDelayMs = statusDelayMs;
  }

  async markInteractiveElements(
    _profileId: string,
    _mode?: "fast" | "normal" | "complex",
  ): Promise<void> {}

  async unmarkInteractiveElements(_profileId: string): Promise<void> {}

  async getMarkedContext(_profileId: string): Promise<string> {
    const successReady =
      this.committed &&
      this.commitAt !== null &&
      Date.now() - this.commitAt >= this.statusDelayMs;
    return [
      `[7] <input id="firstName" type="text" value="${this.fields.firstName}" placeholder="First name">`,
      `[8] <input id="lastName" type="text" value="${this.fields.lastName}" placeholder="Last name">`,
      `[11] <input id="email" type="email" value="${this.fields.email}" placeholder="Work email">`,
      `[14] <input id="company" type="text" value="${this.fields.company}" placeholder="Company">`,
      `[17] <select id="role" selected="${this.fields.role || ""}">Founder</select>`,
      `[18] <select id="teamSize" selected="${this.fields.teamSize || ""}">Just me</select>`,
      `[19] <input id="password" type="password" value="${this.fields.password}" placeholder="Password">`,
      `[21] <input id="terms" type="checkbox" ${this.fields.terms ? "checked" : ""} aria-checked="${this.fields.terms ? "true" : "false"}">`,
      `[24] <button id="submitBtn" type="submit">Create account</button>`,
      successReady
        ? `[30] <div role="status" class="alert alert-success">Account created successfully</div>`
        : `[30] <div role="status" class="alert">Waiting...</div>`,
    ].join("\n");
  }

  async detectVisualErrors(): Promise<string[]> {
    return [];
  }

  async getOutcomeSignals(): Promise<string[]> {
    const successReady =
      this.committed &&
      this.commitAt !== null &&
      Date.now() - this.commitAt >= this.statusDelayMs;
    return successReady ? ["outcome:success", "status:created"] : [];
  }

  async getVisualSignals(): Promise<
    Array<{
      text: string;
      role: string;
      className: string;
      color: string;
      backgroundColor: string;
      borderColor: string;
      ariaLive: string;
      toneHint: "success" | "error" | "warning" | "info" | "neutral";
    }>
  > {
    const successReady =
      this.committed &&
      this.commitAt !== null &&
      Date.now() - this.commitAt >= this.statusDelayMs;
    if (!successReady) return [];
    return [
      {
        text: "Account created successfully",
        role: "status",
        className: "alert alert-success",
        color: "",
        backgroundColor: "",
        borderColor: "",
        ariaLive: "polite",
        toneHint: "success",
      },
    ];
  }

  async executeActionOnMarkedElement(
    _profileId: string,
    elementId: number,
    action: "CLICK" | "TYPE" | "SELECT" | "CHECK" | "UNCHECK" | "HOVER" | "ASSERT",
    value?: string,
  ): Promise<void> {
    if (action === "TYPE") {
      if (elementId === 7) this.fields.firstName = value || "Elon";
      if (elementId === 8) this.fields.lastName = value || "Musk";
      if (elementId === 11) this.fields.email = value || "elon@spacex.com";
      if (elementId === 14) this.fields.company = value || "SpaceX";
      if (elementId === 19) this.fields.password = value || "Rac!123Test";
      return;
    }
    if (action === "SELECT") {
      if (elementId === 17) this.fields.role = value || "Founder";
      if (elementId === 18) this.fields.teamSize = value || "Just me";
      return;
    }
    if (action === "CHECK" && elementId === 21) {
      this.fields.terms = true;
      return;
    }
    if (action === "UNCHECK" && elementId === 21) {
      this.fields.terms = false;
      return;
    }
    if (action === "CLICK" && elementId === 24) {
      const requiredFilled =
        !!this.fields.firstName &&
        !!this.fields.lastName &&
        !!this.fields.email &&
        !!this.fields.company &&
        !!this.fields.role &&
        !!this.fields.teamSize &&
        !!this.fields.password &&
        this.fields.terms;
      if (requiredFilled) {
        this.committed = true;
        this.commitAt = Date.now();
      }
      return;
    }
  }

  async waitForDOMStability(_timeoutMs?: number): Promise<void> {
    await sleep(2);
  }
}

class BenchmarkLLMProvider implements ILLMProvider {
  private readonly random: () => number;
  private readonly planLatencyBaseMs: number;
  private readonly earlyFinishInjection: boolean;
  private readonly duplicateCommitInjection: boolean;
  private readonly checkboxFlipInjection: boolean;
  private injectedEarlyFinish = false;
  private injectedDuplicateCommit = false;
  private injectedCheckboxFlip = false;

  constructor(seed: number) {
    this.random = mulberry32(seed);
    this.planLatencyBaseMs = 550 + Math.floor(this.random() * 750);
    this.earlyFinishInjection = this.random() < 0.35;
    this.duplicateCommitInjection = this.random() < 0.45;
    this.checkboxFlipInjection = this.random() < 0.35;
  }

  async generateSteps(
    _prompt: string,
    _context?: string,
    _dom?: string,
    previousSteps: TestStep[] = [],
  ): Promise<TestStep[]> {
    const latency =
      this.planLatencyBaseMs +
      Math.floor(this.random() * 220) +
      (previousSteps.length === 0 ? 900 : 0);
    await sleep(latency);

    const done = new Set(previousSteps.map((s) => `${s.action}:${s.targetId || 0}`));
    const hasCommitted = done.has("CLICK:24");
    const hasCheckedTerms = done.has("CHECK:21");
    const hasUncheckedTerms = done.has("UNCHECK:21");

    if (this.earlyFinishInjection && !this.injectedEarlyFinish && !hasCommitted) {
      this.injectedEarlyFinish = true;
      return [step("FINISH", 1)];
    }
    if (
      this.checkboxFlipInjection &&
      !this.injectedCheckboxFlip &&
      hasCheckedTerms &&
      !hasUncheckedTerms
    ) {
      this.injectedCheckboxFlip = true;
      return [step("UNCHECK", 1, 21)];
    }
    if (
      this.duplicateCommitInjection &&
      !this.injectedDuplicateCommit &&
      hasCommitted
    ) {
      this.injectedDuplicateCommit = true;
      return [step("CLICK", 1, 24), step("FINISH", 2)];
    }

    const basePlan: TestStep[] = [
      step("TYPE", 1, 7, "Elon"),
      step("TYPE", 2, 8, "Musk"),
      step("TYPE", 3, 11, "elon@spacex.com"),
      step("TYPE", 4, 14, "SpaceX"),
      step("SELECT", 5, 17, "Founder"),
      step("SELECT", 6, 18, "Just me"),
      step("TYPE", 7, 19, "Rac!123Test"),
      step("CHECK", 8, 21),
      step("CLICK", 9, 24),
      step("FINISH", 10),
    ];

    const pending = basePlan.filter(
      (s) => !done.has(`${s.action}:${s.targetId || 0}`),
    );
    if (pending.length === 0) return [step("FINISH", 10)];
    return pending.slice(0, 3);
  }

  async evaluateOutcome(_params: any): Promise<{
    verdict: "success" | "failure" | "inconclusive";
    confidence: number;
    rationale: string;
  }> {
    return {
      verdict: "success",
      confidence: 0.85,
      rationale: "Benchmark evaluator success.",
    };
  }

  async classifyVisualState(_params: any): Promise<{
    verdict: "error" | "success" | "warning" | "neutral";
    confidence: number;
    rationale: string;
  }> {
    return {
      verdict: "neutral",
      confidence: 0.45,
      rationale: "Benchmark visual neutral.",
    };
  }
}

function getFirstPlanMs(entry: any): number {
  const cycles = entry?.autopilotTelemetry?.cycles || [];
  const firstPlanCycle = cycles.find((cycle: any) => Number(cycle.planMs) > 0);
  return firstPlanCycle ? Number(firstPlanCycle.planMs) : 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * p)),
  );
  return sorted[idx];
}

async function runBenchmark() {
  await storageService.clearAllData();
  await seedSettings();

  const firstPlanMs: number[] = [];
  const avgCycleMs: number[] = [];
  const hardReplans: number[] = [];
  const statuses: Record<string, number> = {};

  for (let i = 0; i < RUNS; i++) {
    const domMarker = new BenchmarkDOMMarker(25 + (i % 4) * 12);
    const llmProvider = new BenchmarkLLMProvider(7000 + i * 97);
    const agent = new AgentService(
      new BenchmarkInspector(),
      llmProvider,
      domMarker,
    );
    await agent.start(GOAL, `benchmark-profile-${i + 1}`);
    const history = await storageService.getHistory();
    const latest = history[0];
    if (!latest) {
      statuses.missing = (statuses.missing || 0) + 1;
      continue;
    }
    statuses[latest.status] = (statuses[latest.status] || 0) + 1;
    const summary = latest.autopilotTelemetry?.summary;
    if (summary) {
      firstPlanMs.push(getFirstPlanMs(latest));
      avgCycleMs.push(Number(summary.avgCycleMs || 0));
      hardReplans.push(Number(summary.replans || 0));
    }
  }

  const successRate = ((statuses.completed || 0) / RUNS) * 100;
  const nowIso = new Date().toISOString();

  console.log(`Autopilot Benchmark Report`);
  console.log(`date=${nowIso}`);
  console.log(`runs=${RUNS}`);
  console.log(`goal="${GOAL}"`);
  console.log(
    `status_counts completed=${statuses.completed || 0} failed=${statuses.failed || 0} cancelled=${statuses.cancelled || 0} missing=${statuses.missing || 0}`,
  );
  console.log(`success_rate=${successRate.toFixed(2)}%`);
  console.log(
    `first_plan_ms mean=${mean(firstPlanMs).toFixed(1)} p50=${percentile(firstPlanMs, 0.5).toFixed(1)} p95=${percentile(firstPlanMs, 0.95).toFixed(1)}`,
  );
  console.log(
    `avg_cycle_ms mean=${mean(avgCycleMs).toFixed(1)} p50=${percentile(avgCycleMs, 0.5).toFixed(1)} p95=${percentile(avgCycleMs, 0.95).toFixed(1)}`,
  );
  console.log(
    `hard_replans mean=${mean(hardReplans).toFixed(2)} p50=${percentile(hardReplans, 0.5).toFixed(0)} p95=${percentile(hardReplans, 0.95).toFixed(0)}`,
  );
}

await runBenchmark();
