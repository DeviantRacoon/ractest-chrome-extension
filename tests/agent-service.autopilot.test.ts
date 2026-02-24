import { beforeEach, describe, expect, test } from "bun:test";
import type { TestStep, UserSettings } from "../src/commons/types";
import { StorageKeys } from "../src/commons/types";
import { storageService } from "../src/commons/lib/storage";
import { AgentService } from "../src/core/application/AgentService";
import type {
  IDOMMarker,
  IInspector,
  ILLMProvider,
} from "../src/core/domain/interfaces";

const DEFAULT_SETTINGS: UserSettings = {
  defaultDelay: 0,
  theme: "dark",
  language: "en",
  highlightColor: "#10B981",
  notificationsEnabled: true,
  enableAiForTesting: true,
  openRouterApiKey: "test-key",
  agentMaxSteps: 12,
  agentMode: "strict_fail_fast",
  maxRetriesNonCritical: 0,
};

function makeStep(
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

class MockInspector implements IInspector {
  private errorCallback: ((error: any) => void) | null = null;

  async activateInspector(_profileId: string): Promise<void> {}

  async deactivateInspector(): Promise<void> {}

  async highlightElement(_selector: string, _message?: string): Promise<void> {}

  async getDistilledDOM(_profileId: string): Promise<string> {
    return "";
  }

  async executeStep(_step: TestStep): Promise<void> {}

  onElementCaptured(_callback: (info: any) => void): void {}

  onErrorCaptured(callback: (error: any) => void): void {
    this.errorCallback = callback;
  }

  emitError(error: any) {
    this.errorCallback?.(error);
  }
}

class MockLLMProvider implements ILLMProvider {
  private readonly chunk: TestStep[];

  constructor(chunk: TestStep[]) {
    this.chunk = chunk;
  }

  async generateSteps(
    _prompt: string,
    _context?: string,
    _dom?: string,
    _previousSteps: TestStep[] = [],
  ): Promise<TestStep[]> {
    return this.chunk.map((step, index) => ({
      ...step,
      id: `${step.id}-${index}-${Date.now()}`,
    }));
  }

  async evaluateOutcome(): Promise<{
    verdict: "success" | "failure" | "inconclusive";
    confidence: number;
    rationale: string;
  }> {
    return {
      verdict: "success",
      confidence: 0.9,
      rationale: "Mocked outcome success.",
    };
  }

  async classifyVisualState(): Promise<{
    verdict: "error" | "success" | "warning" | "neutral";
    confidence: number;
    rationale: string;
  }> {
    return {
      verdict: "neutral",
      confidence: 0.4,
      rationale: "Mocked neutral visual state.",
    };
  }
}

class MockDOMMarker implements IDOMMarker {
  private context: string;
  private checkboxChecked: boolean;
  private successAfterCommit: boolean;
  private committed = false;
  public readonly actions: Array<{
    elementId: number;
    action: "CLICK" | "TYPE" | "SELECT" | "CHECK" | "UNCHECK" | "HOVER" | "ASSERT";
    value?: string;
  }> = [];

  constructor(params: {
    context: string;
    checkboxChecked?: boolean;
    successAfterCommit?: boolean;
  }) {
    this.context = params.context;
    this.checkboxChecked = params.checkboxChecked || false;
    this.successAfterCommit = params.successAfterCommit !== false;
  }

  async markInteractiveElements(
    _profileId: string,
    _mode?: "fast" | "normal" | "complex",
  ): Promise<void> {}

  async unmarkInteractiveElements(_profileId: string): Promise<void> {}

  async getMarkedContext(_profileId: string): Promise<string> {
    return this.renderContext();
  }

  async detectVisualErrors(): Promise<string[]> {
    return [];
  }

  async getOutcomeSignals(): Promise<string[]> {
    if (this.committed || this.checkboxChecked) {
      return ["outcome:success"];
    }
    return [];
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
    if (this.successAfterCommit && (this.committed || this.checkboxChecked)) {
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
    return [];
  }

  async executeActionOnMarkedElement(
    _profileId: string,
    elementId: number,
    action: "CLICK" | "TYPE" | "SELECT" | "CHECK" | "UNCHECK" | "HOVER" | "ASSERT",
    value?: string,
  ): Promise<void> {
    this.actions.push({ elementId, action, value });
    if (action === "CLICK" && elementId === 24) {
      this.committed = true;
    }
    if (action === "CHECK" && elementId === 21) {
      this.checkboxChecked = true;
    }
    if (action === "UNCHECK" && elementId === 21) {
      this.checkboxChecked = false;
    }
  }

  async waitForDOMStability(_timeoutMs?: number): Promise<void> {}

  private renderContext(): string {
    const checked = this.checkboxChecked ? " checked" : "";
    return this.context.replace("__CHECKED__", checked);
  }
}

describe("AgentService Autopilot safeguards", () => {
  beforeEach(async () => {
    await storageService.clearAllData();
    await seedSettings();
  });

  test("deriveSubmitLifecycleState honors filling and committed states", () => {
    const service = new AgentService(
      new MockInspector(),
      new MockLLMProvider([]),
      new MockDOMMarker({ context: "" }),
    );
    const derive = (service as any).deriveSubmitLifecycleState.bind(service);

    const filling = derive({
      goalRequiresCriticalCommit: true,
      pendingCriticalCommitAction: true,
      hasSubmittedCriticalAction: false,
      fillFirstStrategy: true,
      formProgress: { totalControls: 6, filledControls: 3 },
    });
    const ready = derive({
      goalRequiresCriticalCommit: true,
      pendingCriticalCommitAction: true,
      hasSubmittedCriticalAction: false,
      fillFirstStrategy: true,
      formProgress: { totalControls: 6, filledControls: 6 },
    });
    const committed = derive({
      goalRequiresCriticalCommit: true,
      pendingCriticalCommitAction: true,
      hasSubmittedCriticalAction: true,
      fillFirstStrategy: true,
      formProgress: { totalControls: 6, filledControls: 6 },
    });

    expect(filling).toBe("filling");
    expect(ready).toBe("ready_to_commit");
    expect(committed).toBe("committed");
  });

  test("suppresses duplicate commit click on the same target after first commit", async () => {
    const domMarker = new MockDOMMarker({
      context: `[24] <button id="submitBtn" type="submit">Create account</button>\n`,
    });
    const llm = new MockLLMProvider([
      makeStep("CLICK", 1, 24),
      makeStep("CLICK", 2, 24),
      makeStep("FINISH", 3),
    ]);
    const service = new AgentService(new MockInspector(), llm, domMarker);
    const logs: string[] = [];
    service.setLogCallback((log) => logs.push(log.message));

    await service.start("Create an account and submit it", "profile-test");

    const commitClicks = domMarker.actions.filter(
      (entry) => entry.action === "CLICK" && entry.elementId === 24,
    );
    expect(commitClicks.length).toBe(1);
    expect(
      logs.some((line) => line.includes("Duplicate commit click suppressed")),
    ).toBeTrue();
  });

  test("suppresses contradictory checkbox flip within anti-flip window", async () => {
    const domMarker = new MockDOMMarker({
      context:
        `[21] <input type="checkbox" id="terms" __CHECKED__ aria-checked="false">\n` +
        `[31] <button id="okBtn" type="button">Continue</button>\n`,
      checkboxChecked: false,
      successAfterCommit: true,
    });
    const llm = new MockLLMProvider([
      makeStep("CHECK", 1, 21),
      makeStep("UNCHECK", 2, 21),
      makeStep("FINISH", 3),
    ]);
    const service = new AgentService(new MockInspector(), llm, domMarker);
    const logs: string[] = [];
    service.setLogCallback((log) => logs.push(log.message));

    await service.start("Marca el checkbox de terminos y finaliza", "profile-test");

    const checkboxActions = domMarker.actions
      .filter((entry) => entry.elementId === 21)
      .map((entry) => entry.action);
    expect(checkboxActions).toEqual(["CHECK"]);
    expect(logs.some((line) => line.includes("Anti-flip"))).toBeTrue();
  });
});
