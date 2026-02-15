# RacTest Privacy and Security Policy

Last updated: February 15, 2026

RacTest is designed with a **local-first** architecture. Your data stays in your browser unless you explicitly use external AI features.

## 1. Data Storage

RacTest does not operate first-party servers for storing your project data.

The extension stores data locally on your device using Chrome storage:

- Flows (test recipes and steps)
- Execution history
- App settings and preferences

## 2. OpenRouter API Key

To use AI features, you provide an OpenRouter API key.

- The key is encrypted at rest using AES-GCM before local storage.
- The key is decrypted only in memory when making an AI request.
- The key is never sent to RacTest-owned servers.
- The key is sent only to OpenRouter when you trigger an AI action.

## 3. Browsing Data and Page Access

RacTest interacts with web pages only when you use features such as:

- DOM inspector
- Step capture
- Flow execution
- Autopilot agent actions

During execution, RacTest may capture runtime diagnostics (for example console/network errors) to display execution reports in the extension.

RacTest does not sell browsing data and does not run third-party ad/tracking scripts.

## 4. External Communications

RacTest communicates externally only when required by user-triggered features:

- OpenRouter API calls for AI step generation and autopilot decisions.

For those calls, relevant page context (for example distilled HTML/text and your test goal) may be transmitted to OpenRouter to produce results.

## 5. User Controls

You can at any time:

- Remove your API key
- Clear execution history
- Export your local data
- Import data backups
- Reset all stored RacTest data

## 6. Open Source Transparency

RacTest is open source. You can inspect the implementation details in this repository.

## 7. Contact

For privacy or security questions, open an issue in the repository.
