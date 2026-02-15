# Product Requirements Document (PRD): RacTest

| Attribute | Details |
| :-- | :-- |
| Product Name | RacTest |
| Product Type | Google Chrome Extension (Manifest V3, Side Panel) |
| Current Version | 1.0.0 |
| Document Status | Active |
| Product Vision | Help teams create and run repeatable web test flows quickly, with a local-first architecture and optional AI assistance. |

## 1. Problem Statement

Manual web testing is repetitive, slow, and error-prone. Existing automation tools often require scripting knowledge and setup overhead that blocks non-technical users.

RacTest solves this by allowing users to capture, generate, edit, and execute test flows directly from the browser UI.

## 2. Product Goals

1. Reduce time to create a runnable web test flow.
2. Enable non-programmatic test authoring from real page interactions.
3. Provide deterministic execution with clear error reporting.
4. Keep user data private through local-first storage and encrypted secrets.
5. Improve coverage with AI-assisted step generation and autonomous navigation.

## 3. Target Users

- QA engineers validating regression and smoke flows.
- Frontend developers validating critical user journeys.
- Product teams that need fast verification without full test framework setup.

## 4. Core User Flows

### 4.1 Create and Run a Manual Flow

1. User creates a new flow (name + target URL).
2. User captures DOM elements with the inspector.
3. User configures actions (click, type, select, checkbox/radio) and delays.
4. User reorders/edits steps.
5. User runs the flow and monitors progress.
6. User reviews execution details and logs in History.

### 4.2 Generate Steps with AI (Flow Builder)

1. User opens a flow in the step editor.
2. User provides a test goal/prompt.
3. RacTest distills page context and calls OpenRouter.
4. Generated steps are inserted into the flow for review.
5. User adjusts steps and executes.

### 4.3 Autopilot Agent Execution

1. User sets a start URL and high-level goal.
2. User chooses reading mode (fast/normal/complex) and agent settings.
3. Agent navigates and interacts autonomously.
4. User monitors live logs/status and stops execution when needed.

## 5. Functional Requirements

### 5.1 Flow Management

- Create, list, search, edit, and delete flows.
- Persist flows in `chrome.storage.local`.
- Support importing/exporting flow data.

### 5.2 Step Authoring and Inspector

- Visual DOM highlighting on hover.
- Element capture with robust selectors.
- Step configuration for supported actions:
  - `CLICK`
  - `TYPE`
  - `SELECT`
  - `CHECK` / `UNCHECK`
  - `ASSERT` (used in agent/AI-driven paths)
- Per-step delay configuration and ordering.

### 5.3 Execution Engine

- Sequential step execution with delay handling.
- Real-time progress and cancellation.
- Fail-fast behavior for invalid selectors/required values.
- Structured error messages per failed step.

### 5.4 AI Features

- OpenRouter API integration for:
  - AI step generation in flow editor.
  - Autonomous Autopilot agent loop.
- Configurable model, token limits, retries, and execution mode (strict/balanced).
- API key required and validated before AI actions.

### 5.5 History and Reporting

- Store execution records with status, timestamps, and metadata.
- Show step-level traces and captured logs.
- Allow clearing history from settings/history UI.

### 5.6 Settings and Data Controls

- Manage API key, model, delays, language, theme, and agent limits.
- Import/export all local data.
- Reset all local data with confirmation.

## 6. Non-Functional Requirements

### 6.1 Privacy and Security

- Local-first data storage.
- API key encrypted at rest (AES-GCM).
- No first-party backend for user data.

### 6.2 Performance

- UI interactions should remain responsive during authoring.
- Execution status updates should be near real-time.
- Large pages should still support inspector and AI context extraction.

### 6.3 Reliability

- Safe handling of missing/changed selectors.
- Consistent persistence and data recovery across browser restarts.

## 7. Technical Scope

- Platform: Chrome Extension MV3.
- Main permissions: `storage`, `activeTab`, `scripting`, `tabs`, `sidePanel`.
- Host access: `<all_urls>` for testing interactions and DOM analysis.
- Stack: React + TypeScript + Vite + Tailwind.

## 8. Success Metrics

1. Median time to first runnable flow.
2. Flow execution success rate.
3. AI-generated steps accepted without manual edits.
4. Daily/weekly active users running at least one flow.
5. Number of failed runs with actionable error diagnostics.

## 9. Out of Scope (Current Release)

- Cloud sync and multi-user collaboration.
- CI/CD integration.
- Visual snapshot diffing.
- Native support for browsers other than Chrome.
