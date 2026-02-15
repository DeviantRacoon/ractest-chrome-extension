import type { TestStep } from "../../commons/types";
import type { AgentRunReport } from "../domain/interfaces";

export class ReportGenerator {
  private report: AgentRunReport;

  constructor(goal: string) {
    this.report = {
      id: crypto.randomUUID(),
      goal,
      status: "COMPLETED", // Default assumption, will update on failure/stop
      startTime: Date.now(),
      endTime: 0,
      durationMs: 0,
      stepsExecuted: 0,
      steps: [],
      errors: {
        visual: [],
        console: [],
        network: [],
      },
    };
  }

  public addStep(step: TestStep) {
    this.report.steps.push(step);
    this.report.stepsExecuted++;
  }

  public addError(type: "visual" | "console" | "network", error: any) {
    if (type === "visual") {
      this.report.errors.visual.push(error);
    } else if (type === "console") {
      this.report.errors.console.push(error);
    } else if (type === "network") {
      this.report.errors.network.push(error);
    }
  }

  public setStatus(status: AgentRunReport["status"]) {
    this.report.status = status;
  }

  public finalize(): AgentRunReport {
    this.report.endTime = Date.now();
    this.report.durationMs = this.report.endTime - this.report.startTime;
    return this.report;
  }

  public getReport(): AgentRunReport {
    return this.report;
  }
}
