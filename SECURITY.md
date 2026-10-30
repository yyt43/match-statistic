# Security Policy

## Supported Versions

The project is currently in active development. Security updates are provided for the latest `main` branch revision.

## Reporting a Vulnerability

Please do not disclose security vulnerabilities publicly in issues or pull requests.

Instead, contact the maintainer through the repository's private contact channel or GitHub security advisory workflow if available.

Please include:

- a brief description of the issue
- reproduction steps or proof of concept
- affected version or commit
- impact assessment

We will respond as quickly as possible and coordinate a fix before public disclosure.

## Supply-chain notes

- `xlsx` (SheetJS) is installed from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` instead of the npm registry, so `npm audit`, Dependabot and dependency-review do not cover it. Integrity is pinned in `package-lock.json`; upgrade it by editing the URL in `package.json` and reviewing the upstream release notes. See `THIRD_PARTY_NOTICES.md` for the full list of known exceptions.
- The production build ships a Content-Security-Policy meta tag (injected by `vite.config.ts` at build time). Only same-origin scripts plus Google Fonts styles/font files are allowed.
- The app stores all data locally (localStorage / IndexedDB) and does not send analytics or telemetry; the only outbound requests are Google Fonts (optional, degrade gracefully offline) and the links on the help page.
