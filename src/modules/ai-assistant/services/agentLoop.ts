import { inspectorService } from "../../../commons/lib/inspectorService";
// Need to handle execution differently as ExecutionEngine is content-side logic usually?
// Actually executionEngine is likely content script. We need to send message to execute step.
// Wait, we have executionService in background or similar?
// Let's check how we execute steps.
// It seems we execute steps via chrome.tabs.sendMessage usually.
// Let's look at `executionEngine` usage.

// Correction: We need to import `executionService` or similar if running from popup.
// However, AgentLoop runs in Popup/SidePanel context.
// `executionEngine` is likely for content script.
// Let's check `src/content/executionEngine.ts` to see where it lives.
// If it lives in content, we must use `inspectorService` or `chrome.tabs.sendMessage` to trigger it.

// Let's assume for now we use a message to execute a step.
import { aiStepGenerator } from "./aiStepGenerator";

export interface AgentLog {
  id: string;
  timestamp: number;
  type: "info" | "action" | "success" | "error" | "thinking";
  message: string;
}

export type LogCallback = (log: AgentLog) => void;

class AgentLoop {
  private isRunning = false;
  private logCallback: LogCallback | null = null;
  private stopRequested = false;

  public setLogCallback(callback: LogCallback) {
    this.logCallback = callback;
  }

  private log(type: AgentLog["type"], message: string) {
    if (this.logCallback) {
      this.logCallback({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type,
        message,
      });
    }
  }

  public stop() {
    this.stopRequested = true;
    this.isRunning = false;
    // We can't force stop async loop immediately, but flag will break it next iteration
    this.log("info", "🛑 Requesting stop...");
  }

  public async start(goal: string, profileId: string) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.stopRequested = false;

    this.log("info", `🚀 Agent started. Goal: "${goal}"`);

    let stepsCount = 0;
    const MAX_STEPS = 20;

    try {
      while (stepsCount < MAX_STEPS) {
        if (this.stopRequested) break;

        // 1. Wait a bit for stability
        await new Promise((r) => setTimeout(r, 2000));
        if (this.stopRequested) break;

        // 2. Observe
        this.log("thinking", "👀 Analyzing page...");
        const dom = await inspectorService.getDistilledDOM(profileId);

        // 3. Decide
        this.log("thinking", "🧠 Deciding next step...");

        // Use existing generator but asking for ONE step
        // We might want to create a specific prompt later
        const aiResult = await aiStepGenerator.generateStepsParams(
          `GOAL: ${goal}. \nCONTEXT: I have already typically done ${stepsCount} steps. \nCURRENT HTML: ${dom} \nCRITICAL: Generate ONLY ONE step that is logically next.`,
        );

        if (!aiResult.steps || aiResult.steps.length === 0) {
          this.log(
            "error",
            "AI could not decide next step (no steps returned). Stopping.",
          );
          break;
        }

        const nextStep = aiResult.steps[0]; // Take only the first step

        // 4. Act
        if (this.stopRequested) break;
        this.log(
          "action",
          `👉 Executing: ${nextStep.action} on ${nextStep.selector}`,
        );

        // EXECUTE STEP
        // We need to send this to the content script
        // We can reuse the `highlightElement` logic structure but for execution
        // Or simply send a message strictly.
        // For now, let's assume we have a way to execute.
        // We will implement `inspectorService.executeStep(step)`

        await inspectorService.executeStep(nextStep);

        this.log("success", "✅ Step executed.");
        stepsCount++;
      }

      if (stepsCount >= MAX_STEPS) {
        this.log("info", "⚠️ Reached maximum steps limit.");
      } else if (this.stopRequested) {
        this.log("info", "🛑 Agent stopped by user.");
      } else {
        this.log("success", "🎉 Agent finished.");
      }
    } catch (error: any) {
      this.log("error", `Agent error: ${error.message}`);
      console.error(error);
    } finally {
      this.isRunning = false;
      this.stopRequested = false;
    }
  }
}

export const agentLoop = new AgentLoop();
