# Delivery verification — 24 October 2026

Verified locally using the bundled Node.js v24.19.0 runtime and installed Google Chrome in headless mode.

| Check | Result |
| --- | --- |
| JavaScript syntax | All modules pass |
| Unit and regression tests | 20 passed, 0 failed, 0 TODOs |
| Bot smoke simulation | 100 games, 12,510 moves, all finished with legal moves |
| Table sizes and difficulties in simulation | 2–6 players; relaxed, social, sharp |
| Blind rounds / Shootouts observed | 100 / 18 games |
| Longest simulated game | 34 rounds |
| Bot decision latency on this machine | Median 0.69 ms; p95 1.95 ms, excluding presentation delay |
| Build | Passed; dist contains relative module, CSS, icon, and worker URLs |
| Final browser smoke test | Passed; complete game of 222 actions |
| Browser errors / HTTP errors during smoke test | None |
| Desktop / narrow phone layout | 1440px and 390px checked; no mobile horizontal overflow |
| Live worker | Real module-worker moves exercised |
| Save / reload / resume | Passed |
| Replay export / import | Passed; reconstructed game reached gameOver |
| Partial-reveal privacy | Exactly one cup revealed; analysis suppressed |
| Repository subpath | Built site exercised at /repository-demo/ |

Desktop and mobile screenshots are included beside this document. A previous browser run also completed a 200-action game successfully. The screenshots show generated test games, not a supplied visual mockup.

The human seat used simple automated challenges in browser tests. These checks establish functionality, not that a bot is as strong as a particular human. Human playtesting, other browser engines, actual phone testing, and the final GitHub account deployment remain unverified.

GitHub workflow action tags and Node 24 support were checked against their official action definitions. The workflows cannot be executed on GitHub until the owner uploads the project and enables Pages. No repository or public deployment has been created on the owner's behalf.

## Live odds update (v1.1.0)

- Syntax checks and build pass; all **31 tests** pass, including 11 new odds-coach tests.
- One- and two-match support models are checked against small exhaustive enumerations; support weight zero, disabled support, blind hands, unavailable assumptions, cross-face drafts, and hidden-hand non-interference are covered.
- Verified the side panel in an isolated in-app browser game, preserving the owner's current table. Confirmed show/hide, one/two support selection, draft face/quantity updates, zero-weight raw equality, enabling/disabling support, and expanded math staying open through setting changes.
- The 30-dice, eleven-twos example displays raw Dudo **82.2%** and soft Dudo **80.5%** with two-match support at 20% weight.
- Screenshot: [live odds comparison](preview-odds.png). This is a generated demonstration game.
- The optional browser-smoke script now includes regression assertions for the panel, mobile overflow, and preference persistence. Those new automated script assertions were not executed in this update; desktop interactions were verified directly in the in-app browser. Existing baseline mobile/full-game checks above predate this panel.
- No bot strategy or replay format changes. Existing version-1 replay files remain compatible. The coaching preference is separate from game saves.
