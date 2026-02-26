import { inspectorService } from "../../../commons/lib/inspectorService";
import type { CapturedElementPayload, TestStep } from "../../../commons/types";
import type { IInspector } from "../../../core/domain/interfaces";

export class ChromeInspectorAdapter implements IInspector {
  async activateInspector(profileId: string): Promise<void> {
    return inspectorService.activateInspector(profileId);
  }

  async deactivateInspector(): Promise<void> {
    return inspectorService.deactivateInspector();
  }

  async highlightElement(selector: string, _message?: string): Promise<void> {
    // The underlying service might not support message yet, but we adhere to interface
    return inspectorService.highlightElement(selector);
  }

  async getDistilledDOM(profileId: string): Promise<string> {
    return inspectorService.getDistilledDOM(profileId);
  }

  async executeStep(step: TestStep): Promise<void> {
    // Current inspectorService implementation logic
    return inspectorService.executeStep(step);
  }

  onElementCaptured(callback: (info: CapturedElementPayload) => void): void {
    inspectorService.onElementCaptured(callback);
  }

  onErrorCaptured(callback: (error: any) => void): void {
    inspectorService.onErrorCaptured(callback);
  }
}
