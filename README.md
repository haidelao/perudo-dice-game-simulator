# It's a Lie -- A twist on the classic 'Perudo'

## Motivations

I really enjoyed playing Perudo and thinking about Da Vinci's variant, It's a Lie, which I played in London. Hence, I created this website to simulate playing with (relatively intelligent) bots in this Perudo-style game with the twists I thought made the classic game more interesting.

You can play with up to 1-5 bots, and toggle dice odds and implied dice odds, which I hope would be educational to help improve how to play the game. You can choose which house rules to play with as well.

### Most importantly, I hope you have fun!

![Desktop game preview](docs/preview-desktop.png)

Delivery checks are recorded in [VERIFIED.md](docs/VERIFIED.md).

## Play locally

Install Node.js 22 or newer (Node 24 recommended), open a terminal in this folder, and run:

```sh
npm run dev
```

Open **http://localhost:4173**. Keep the terminal running. Stop with Ctrl+C. Serve the site over HTTP; opening `index.html` directly as a file will not load module workers reliably.

## Publish on GitHub Pages

1. Create a GitHub repository. A public repository works with GitHub Free. Name it anything, for example `its-a-lie`.
2. Put **the contents of this folder** at the repository root: `index.html`, `package.json`, `src`, `scripts`, `test`, `docs`, and especially the hidden `.github` folder. Do not upload the original scaffold ZIP, `node_modules`, or `dist`.
3. Use `main` as your default branch. If you choose another branch, change the `branches: [main]` entries in both workflow files.
4. In the repository, open **Settings → Pages → Build and deployment → Source**, and select **GitHub Actions**.
5. Open **Actions → Deploy to GitHub Pages → Run workflow** if the initial push happened before Pages was enabled. Later pushes to `main` deploy automatically.
6. Wait for the workflow to succeed. Pages settings and the deployment run will show your URL, normally `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

The workflow runs syntax checks, all unit tests, and 30 complete bot games before publishing. It builds and uploads `dist/` using GitHub's built-in deployment token. No personal token or Cloudflare account is needed. All URLs are relative, including the worker, so repository subpaths and custom domains need no base-path edits.

**Important:** `.github` and `.gitignore` are hidden on macOS. Press Cmd+Shift+. in Finder to show them. A Git client or `git add .` includes them. Uploading through a browser must include `.github/workflows/deploy.yml`.

See [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for repository permissions and environment restrictions. If Pages reports 404, check the Actions run, the selected deployment source, the default branch, and whether `index.html` is at this project's root.

Workflow versions were checked against the official [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [configure-pages](https://github.com/actions/configure-pages), [artifact upload](https://github.com/actions/upload-pages-artifact), and [Pages deployment](https://github.com/actions/deploy-pages) action definitions. A successful local build does not verify your GitHub account's deployment settings.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local source preview at port 4173 |
| `npm run check` | Syntax-check every JavaScript module |
| `npm test` | Engine, probability, privacy, and AI regression tests |
| `npm run simulate -- 100` | Run 100 complete deterministic bot games |
| `npm run build` | Copy the static app to `dist/` with `.nojekyll` |
| `npm run preview` | Serve the built `dist/` folder |

No `npm install` is necessary: these commands use only Node's standard library. There is consequently no dependency lockfile to maintain. The build produces ordinary files; it does not bundle or transpile them. The optional browser smoke test is described in [TESTING.md](docs/TESTING.md).

## Features

- 2–6 seats, five distinct bot personalities, three difficulty levels.
- Dudo, Calza, bluffable Tropical declarations, a one-time blind round, and a persistent Shootout finale.
- A legal bid picker, direction choice, round reveals, table history, and in-app rules.
- Responsive desktop and mobile layouts, keyboard controls, reduced-motion support, system fonts, no downloaded art.
- Toggle **Show odds** during a game to see your dice-only coverage, Dudo, and exact-count probabilities, plus a live preview of the raise selected in your bid picker.
- Optional soft bidder-support model: assume the standing bidder holds at least one or two matching dice, with an adjustable 0–100% mixture weight (default 20%). Raw and adjusted views remain distinct. See [ODDS.md](docs/ODDS.md).
- Automatic local save/resume. JSON replay export/import reconstructs and validates every move; an imported replay can be continued.
- Worker-based AI. Each decision receives only that seat's permitted observation. A failed worker times out and uses a legal fallback.
- Decision notes become visible only after a full reveal. Tropical partial reveals keep private analysis hidden.

## Project map

```text
index.html              Website entry
src/engine.js           Pure rules and state transitions; legal actions; replay
src/random.js           Seeded dice RNG and independent decision RNG helpers
src/ai.js               Human-style bot reasoning and public-reveal learning
src/odds.js             Observation-only live coaching and soft support scenarios
src/worker.js           Isolated bot message handler
src/app.js              UI, saves, replay import/export, turn scheduling
src/styles.css          Responsive visual design
scripts/                Build, local server, syntax check, simulation
test/                   Node standard-library tests
.github/workflows/      Checks and GitHub Pages deployment
docs/                   Rule decisions, AI design, verification and limitations
```

## Design and scope

This replaces the supplied GTO scaffold with a smaller working application. Native modules avoid a framework/build-tool dependency chain for this relatively small game. The engine, bot logic, worker, and UI remain separate and can be migrated to TypeScript or React later without changing the rules contract.

Bots aim for plausible thoughtful play rather than mathematical optimality. Their probabilities and heuristics are approximate; difficulty and personalities should be tuned with human playtesting. Read [AI.md](docs/AI.md).

The supplied original Da Vinci rule sheet was absent. The implemented interpretations are explicit in [RULES.md](docs/RULES.md); these are not independently verified official rules. Physical comeback/heckling and hygiene rules are omitted. This is an independent, unofficial implementation and uses no Da Vinci branding assets.

There is no online multiplayer or shared leaderboard. All dice exist in browser memory, so deliberate browser inspection can expose them. Replay seeds also reveal rolls. Appropriate for casual practice, not trusted competition or stakes. A future multiplayer version needs a server that owns dice and validates actions.

## Privacy

The app makes no analytics or API requests. Game logs are stored under `its-a-lie:v1` in localStorage on the current device, when available. Bot profiles are reconstructed from that game's public reveals; they do not track a player across games. Use **About & privacy → Clear saved game** to remove the save. A game still open in the tab will save again on its next move. The hosting provider may retain standard request logs.
