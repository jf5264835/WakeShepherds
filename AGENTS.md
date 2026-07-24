# Wake Shepherds Development Instructions

This repository contains the Wake Shepherds application.

## General
- Keep changes focused on the requested task.
- Do not perform unrelated refactors.
- Variables should not be renammed or removed without a thorough review of impact.
- Preserve existing functionality unless explicitly asked to change it.
- Do not replace existing libraries or frameworks without a clear reason.
- Never commit secrets, credentials, API keys, or .env files.

## Development
- Run the existing build before completing changes.
- Fix any build errors caused by your changes.
- Preserve the existing application structure where practical.
- Ensure UI changes work on both desktop and mobile.

## Git workflow
- Do not push directly to main.
- Make changes on a task branch.
- Create a pull request when work is ready.
- main represents the accepted development version.

## Production
- Do not modify production infrastructure or deployment configuration unless explicitly asked.
