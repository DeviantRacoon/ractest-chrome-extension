import { AgentService } from "./application/AgentService";
import { OpenRouterAdapter } from "./infrastructure/ai/OpenRouterAdapter";
import { ChromeDOMMarker } from "./infrastructure/chrome/ChromeDOMMarker";
import { ChromeInspectorAdapter } from "./infrastructure/chrome/ChromeInspectorAdapter";

// Composition Root
// Here we wire up the dependencies (Infrastructure -> Application)

const inspector = new ChromeInspectorAdapter();
const domMarker = new ChromeDOMMarker();
const llmProvider = new OpenRouterAdapter();

export const agentService = new AgentService(inspector, llmProvider, domMarker);
