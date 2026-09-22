# Poetic Tournament Results System

[中文 README](./README.md)

Current version: v0.4.1

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-blue)](https://yyt43.github.io/match-statistic/)
[![Release](https://img.shields.io/badge/Release-v0.4.1-orange)](https://github.com/yyt43/match-statistic/releases/tag/v0.4.1)

![Project preview](./docs/social-preview.png)

A lightweight tournament management and result tracking tool for small card-game and competitive events. It helps with registration, grouping, round planning, match tracking, and leaderboard maintenance. It supports multiple groups, Swiss / single-elimination formats, BO1 / BO3 / BO5 / BO7 settings, and Excel / image / JSON exports.

This project is suited for tournament management, club events, team activities, and card-game competitions. Built with modern React + TypeScript, it can be directly deployed to GitHub Pages and is easy to customize or extend.

## Interface Preview

![Desktop interface](./docs/screenshots/main-desktop.png)

<p align="center">
  <img src="./docs/screenshots/main-mobile.png" width="320" alt="Mobile interface" />
</p>

## Key Highlights

- Multi-group tournament management: manage multiple groups, formats, and rounds in one event
- Swiss / single-elimination support: common tournament flow and knockout structures
- One-click Excel import: import player lists from plain text, CSV, TXT, and XLSX
- Multi-sheet workbook support: automatically identify sheet names as group names and import by group
- Player profile templates: generic and Poetry Cup profiles with participant code, 9-digit UID, QQ, and immutable lock rules
- Result workbook import: match by participant code, verify code plus UID, detect conflicts, and route exceptions to referees
- Tencent Docs compatibility: long headers, multiple sheets, screenshot filename references, and optional screenshot verification
- Bye / pre-drop / post-drop handling: supports common edge cases in competitive events
- Persistent operation history: the latest 30 tournament changes survive refresh and can be undone, redone, or restored
- Single-writer protection: the first tab edits while other tabs become read-only
- Configurable tiebreak chains: BO1 / multi-game presets plus custom metric ordering
- Quick score entry: multi-group scoring with search, filters, feedback before advance, and keyboard shortcuts
- Storage health: inspect primary/backup records, mirrors, snapshots, audit data, and repair storage
- Results export: Excel, image, and JSON export for reporting and backups
- Public hosting: ready for GitHub Pages and similar static deployments

## Project Overview

### Source structure

- `src/components/common`: shared dialogs, header, error boundary, and storage notices
- `src/components/competition`: tournament controls, groups, rounds, and playoffs
- `src/components/players`: player management, preview, drops, and rankings
- `src/components/matches`: match lists, result entry, and round editing
- `src/components/export`: Excel/image export and export previews
- `src/i18n`: translations, language context, and localization tests
- `src/store/actions`: competition lifecycle and snapshot actions
- `src/utils/storage`: IndexedDB, localStorage, snapshots, cross-tab sync, and writer locking
- `src/utils/export`: Excel, image, and JSON export
- `src/utils/import`: player profile, result workbook, and field auto-detection
- `src/utils/schema.ts`: import and persistence data validation

### Open and reusable

This project is licensed under the MIT License, which makes it suitable for public display, custom development, and lightweight tool reuse. The license is simple and permissive: you may use, modify, and distribute the software while keeping copyright notices intact.

- License file: [LICENSE](LICENSE)
- Privacy notice: [PRIVACY.md](PRIVACY.md)
- Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- Typical use cases: personal projects, team collaboration, tool-style open source projects
- Goal: easier learning, reuse, and extension while keeping a clear copyright record

- Project name: Poetic Tournament Results System
- Suitable for: card-game events, tabletop league tournaments, group competitions, internal match events
- Goal: reduce manual recordkeeping, unify tournament rules, and present standings clearly
- Stack: React 18 + TypeScript + Vite + Zustand + xlsx
- Deployment model: static frontend deployable to GitHub Pages, Vercel, Nginx, and similar platforms

## Open Source and Collaboration

- License: MIT License
- Default branch: main
- Recommended collaboration flow: feature branch -> PR -> review -> merge into main
- Bug and feature tracking: use GitHub Issues
- Contribution guide: see [CONTRIBUTING.md](CONTRIBUTING.md)

If you want to contribute, feel free to submit feature ideas, bug reports, or improvements.

## Contributing

We welcome contributions and improvements. Before opening a PR, please check the following:

- Confirm the need or reproduction in Issues to avoid duplicate work
- Use `main` as the stable baseline; create `feature/*` or `fix/*` branches for new work
- Follow the existing code structure and testing conventions; add regression tests when needed
- Before submitting, run: `npm run check`, `npm run test:coverage`, `npm run smoke`, `npm run visual:check`, and `npm run build`
- If the change affects Excel import, tournament rules, or ranking logic, update docs and tests together

For most changes, a concise and verifiable commit message is preferred.

## Branch Strategy

A simple branch model is recommended:

- main: stable release branch; ensure tests and build pass before publishing
- develop: optional integration branch for active development
- feature/*: feature branches for new work
- fix/*: bug fix branches
- hotfix/*: urgent production fixes

For small projects, `main` + `feature/*` is also perfectly acceptable.

Excel imports support text pasting, single-sheet imports, and multi-sheet workbook imports. When a workbook contains multiple sheets, the app automatically treats each sheet name as a group name and imports player names separately by sheet.

## Contents

- [Product Requirements (PRD)](docs/PRD.md)

- [Technical Architecture](docs/ARCHITECTURE.md)

- [Features](#features)
- [Unified player workbook import](#unified-player-workbook-import)
- [Multi-sheet Excel import](#multi-sheet-excel-import)
- [Player profiles and UID](#player-profiles-and-uid)
- [Result workbook import](#result-workbook-import)
- [Quick start](#quick-start)
- [Deploy to GitHub Pages](#deploy-to-github-pages)
- [Pairing rules](#pairing-rules)
- [Ranking rules](#ranking-rules)
- [Related links](#related-links)

## Features

### Tournament format and match length

- Match formats: Swiss + single elimination
- Match lengths: BO1 / BO3 / BO5 / BO7
- Playoff generation: when multiple players share equal tiebreak values, a playoff can be generated automatically

### Group and player management

- Multi-group tournament support: create multiple groups inside one event (1–20 groups)
- Overview of all players: preview all group rosters before the event starts and detect duplicate names or empty groups
- Player management: one unified workbook import for nickname, participant code, UID, and QQ, followed by direct editing in the same list

## Unified Player Workbook Import

Player management now has one unified workbook import:

1. Upload `.xlsx`, `.xls`, or `.csv`.
2. The app detects nickname, participant code, UID, and QQ columns.
3. Multi-sheet workbooks match sheet names to existing group names.
4. Column mapping can be adjusted before importing when headers are ambiguous.

The previous name-only import, text-paste panel, and second import button have been removed.

The import process automatically removes blank rows, duplicate names, header-like labels, and irrelevant numeric / note columns to avoid empty names and duplicate entries.

## Multi-sheet Excel Import

When an Excel file contains multiple worksheets, the app creates a group for each sheet name:

- `Group A`, `Group B`, `Group C` become three separate groups
- Valid names inside each sheet are collected and deduplicated
- Empty sheets or sheets without valid names are skipped
- A single-sheet workbook follows the standard single-group flow

This is useful when organizers keep different group rosters in separate tabs and upload them together.

## Player Profiles and UID

Player management includes optional tournament-specific profiles:

- `generic`: nickname only, suitable for ordinary events.
- `poetryCupS2`: participant code, 9-digit game UID, and QQ.

The profile importer automatically recognizes columns such as:

```text
Nickname / Player / Name / 游戏昵称 / 昵称
Participant code / 选手编号 / 参赛编号
UID / Game UID / 游戏UID / 玩家UID
QQ / QQ number / QQ号
```

When the file contains UID and QQ columns, the app switches to the Poetry Cup profile. Missing A01-D32 participant codes can be generated automatically when the group structure supports it. Once locked, participant codes and UIDs cannot be changed.

The app no longer requires a per-match confirmation or dispute flow. If a result is wrong, the referee edits or overrides it directly; imported results require a reason and preserve the override history.

## Result Workbook Import

The result importer accepts Tencent Docs exports and detects headers such as:

```text
Participant code: 我的选手编号 / 选手编号 / 参赛编号 / 编号
UID: 你的原神UID / 游戏UID / 玩家UID / UID
Result: 比赛结果 / 胜方比分 / 你获胜的比分是
Screenshot: 结算截图 / 小王子对局截图 / 截图 / 证据引用
```

Example:

| Participant code | Game UID | Result | Screenshot |
| --- | --- | --- | --- |
| A05 | 180748058 | 我以 2-1 获胜 | A-R1-03_01.jpg |

The importer supports multiple sheets, flexible column order, descriptive long headers, winner-perspective results, optional screenshots, conflict detection, and code-plus-UID identity verification. Code and UID mismatches are held for referee review.

### Pairing and ranking

- Pairing algorithm: score bucket -> fold pairing -> exhaustive backtracking -> priority-based group shifting -> remaining byes
- Ranking rules: use the default format preset or configure a custom tiebreak chain
  - BO1: wins -> SOS -> SOSOS
  - BO3 / BO5 / BO7: wins -> SOS -> player game win rate -> opponent game win rate
- Draws: supported in BO1 and multi-game formats; in single elimination, both players can be eliminated in the same round

### Drop handling

- Pre-drop: a match-level withdrawal; the winner receives the win, the loser is not counted as a normal loss, and the dropped player is flagged
- Post-drop: a player-level drop; no new results are assigned, later rounds are skipped, and ranking math automatically adjusts for lower match counts
- Bye rules: a bye counts as a valid win for the player and a simulated opponent record is added to the network

### Export and tools

- Export capabilities: Excel (`.xlsx` with rankings + round details), player list images, and full event JSON for backup and re-import
- Error boundary: a global error wrapper shows recovery options and preserves data
- Other features: test mode, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, preview modal optimization, responsive UI, and accessibility labels

## Quick Start

```bash
# install dependencies
npm install

# local development
npm run dev

# type check
npm run check

# run tests
npm test

# run tests with coverage thresholds
npm run test:coverage

# browser smoke test (requires local Chrome or Edge)
npm run smoke

# offline PWA test
npm run smoke:offline

# visual regression check
npm run visual:check

# production build
npm run build
```

The build output is placed in `dist/`, and the app can be deployed to any static hosting provider such as GitHub Pages, Vercel, or Nginx.

## Deploy to GitHub Pages

The project includes GitHub Pages deployment configuration. The repository root contains `.github/workflows/deploy.yml`, which builds and deploys automatically when commits are pushed to `main`.

### Manual local deployment

```bash
npm install
npm run build
npm run deploy
```

If you are using a public repository on GitHub, the app will be available at:

- `https://yyt43.github.io/match-statistic/`

If the repository name differs, update the `homepage` field in `package.json` and the `base` setting in `vite.config.ts` accordingly.

## Pairing Rules

The Swiss pairing follows these rules (see the in-app help for the full explanation):

| # | Rule | Description |
| -- | ----- | ----------- |
| 1 | First round randomization | All active players are shuffled and paired; an odd number creates a bye |
| 2 | No repeated matchups | Players are not paired twice against the same opponent |
| 3 | Down-group prioritization | players with down markers are prioritized before other group members |
| 4 | Up-group prioritization | players with up markers are prioritized when matching against higher-score groups |
| 5 | Marker compensation | players gain a priority after being matched up or down, then the marker resets |
| 6 | Secondary fallback | if everyone is marked, the top or bottom-ranked player receives a second chance |
| 7 | Final bye | unpaired players at the end of the process receive a bye |
| 8 | Bye scoring | byes are scored automatically based on format (BO1=1-0, BO3=2-0, etc.) |
| 9 | In-group strategy | fold pairing is tried first, then exhaustive backtracking, then group shifting |
| 10 | Ordered down-group processing | internal matches are prioritized before cross-group matching |

## Ranking Rules

When multiple players share the same record, rankings use the following default tiebreak chains. Before the event starts, the format settings can use a preset or a custom metric order.

### BO1 format

```
Wins -> SOS -> SOSOS -> points -> name
```

### BO3 / BO5 / BO7 formats

```
Wins -> SOS -> player game win rate -> opponent game win rate -> points -> name
```

### Playoff rules

When all regular tiebreak values are equal, players in each tied group are paired separately. Playoff matches may be replayed against players already met during the regular stage:

- Two players: direct playoff final, may replay if needed
- Three players: a single elimination bracket is generated; the waiting player does not receive an automatic win
- Four players: first round pairs winners and losers separately for placements
- More than four players: manual rules should be applied by the organizer

Final rankings are decided by playoff results; they are not based on playoff wins alone. If the first match result is changed, the affected subsequent playoff bracket is cleared and can be recovered after save or reload.

## Related Links

- [GitHub Repository](https://github.com/yyt43/match-statistic)
- [Live Demo](https://yyt43.github.io/match-statistic/)
- [CHANGELOG](CHANGELOG.md)

## License

This project is distributed under the MIT License.
