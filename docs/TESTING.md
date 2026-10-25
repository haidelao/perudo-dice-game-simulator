# Verification

## Automated checks

```sh
npm run check
npm test
npm run simulate -- 100
npm run build
npm run preview
```

The unit suite covers ace transitions, bid caps, wild counting, Tropical truth and bluff, response restrictions, once-per-round declarations, Calza, penalties, direction, elimination, blind visibility, Shootout entry and persistence, observation privacy, exact deterministic replays, RNG face balance, optional rules, probability normalisation, partial-reveal learning, bot non-interference from hidden-hand changes, obvious challenges, and bot legality through a full game.

The simulation cycles 2–6 players and all three difficulty levels. It asserts legal moves, valid dice counts, and complete games with a bounded safety ceiling. Mixed-size win totals are diagnostic only and cannot be compared as balanced win rates. Latency excludes the UI's intentional thinking delay and depends on hardware.

Live-coach tests also check mixture weights, one- and two-match conditioning, joint face counts against exhaustive ordered dice enumeration, blind handling, impossible support assumptions, cross-face drafts, privacy, and the direction of the Dudo adjustment. The suite now has 31 tests.

## Browser smoke test

The optional browser script uses Playwright. It is a development tool, not shipped to the website. Build first; the script starts and stops its own temporary server for the built app:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run build
node scripts/browser-smoke.mjs
```

The script checks desktop setup, mobile overflow, a real worker decision, a full human/bot game, save/resume, replay reconstruction, partial-reveal privacy, built asset loading, and a repository subpath. To use an externally installed Playwright, set `PLAYWRIGHT_MODULE` to its `index.mjs` path. To use an already-installed Google Chrome instead of a downloaded Chromium, set `BROWSER_CHANNEL=chrome`. Browser screenshots and test output go to a temporary directory outside the project.

## Manual acceptance

- Start with 2, 4, and 6 seats. Check turn focus and clear legal bids on desktop and a narrow phone.
- Play a full game. Observe challenges, elimination, and final rematch. Open and dismiss rules using keyboard and Escape.
- Disable optional house rules and confirm those actions disappear.
- Reload and resume. Export and reimport a replay. Confirm there are no live private bot explanations.
- Check the actual GitHub Pages URL, refresh, and worker loading. The local subpath check verifies relative paths, but cannot verify account-specific Pages permissions.
- Test on an actual phone and Safari/Firefox before treating cross-browser support as established.

## Limits

Automated games do not establish that the bots feel human. That needs people playing and feedback. No accessibility audit, broad device lab, online multiplayer test, or formal security audit is claimed. The app targets modern browsers supporting ES modules, module workers, structuredClone, dialog, and localStorage.
