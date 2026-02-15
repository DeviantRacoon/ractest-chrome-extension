# Contributions Guide

Thanks for contributing to RacTest.

## Before You Start

- Search existing issues and pull requests to avoid duplicates.
- For large changes, open an issue first to align on scope.
- Keep contributions focused and incremental.

## Development Setup

1. Install dependencies:

```bash
npm install
```

2. Start development mode:

```bash
npm run dev
```

3. Build the extension:

```bash
npm run build
```

4. Lint the code:

```bash
npm run lint
```

## Branch and Commit Guidelines

- Create a dedicated branch per change.
- Use clear commit messages in imperative form.
- Keep each PR scoped to one concern when possible.

Suggested branch naming:

- `feature/<short-name>`
- `fix/<short-name>`
- `docs/<short-name>`
- `refactor/<short-name>`

## Pull Request Checklist

- Describe the problem and the solution clearly.
- Link related issues.
- Include screenshots/GIFs for UI changes.
- Mention any behavior changes and migration impact.
- Ensure build and lint pass locally.
- Update docs when behavior or setup changes.

## Code Standards

- Use TypeScript and existing project patterns.
- Prefer small, readable components and hooks.
- Avoid unrelated refactors in the same PR.
- Keep strings translatable when touching UI text.

## Testing Expectations

This project currently relies on manual and runtime validation.

When contributing:

- Validate the affected flows in the extension UI.
- Test both success and failure paths for execution changes.
- Confirm data persistence behavior for storage-related changes.

## Security and Privacy

- Never commit secrets (API keys, tokens, credentials).
- Preserve local-first and privacy-by-default behavior.
- Keep sensitive values encrypted/obfuscated when persisted.

## Reporting Issues

When opening an issue, include:

- Environment (OS, Chrome version)
- RacTest version/commit
- Steps to reproduce
- Expected result vs actual result
- Console logs or screenshots when relevant

## Questions

If something is unclear, open a discussion or issue before implementing large changes.
