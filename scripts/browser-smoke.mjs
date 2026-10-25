// Optional development test. Requires Playwright; never included in dist/.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { newGame, applyAction, replay, VERSION } from '../src/engine.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const output = await mkdtemp(path.join(os.tmpdir(), 'its-a-lie-browser-'));
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname.replace(/^\/repository-demo\//, '/');
    const file = path.resolve(root, '.' + (relative.endsWith('/') ? relative + 'index.html' : relative));
    if (!file.startsWith(root)) throw new Error('Bad path');
    const data = await readFile(file);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'text/plain' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/repository-demo/`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [], failed = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  // Only skip the deliberate cosmetic thinking delay, keeping worker timeouts intact.
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (fn, delay, ...args) => original(fn, delay >= 600 && delay <= 1200 ? 0 : delay, ...args);
  });
  await page.goto(url);
  await page.getByRole('heading', { name: /The dice are hidden/ }).waitFor();
  await page.screenshot({ path: path.join(output, 'desktop-setup.png'), fullPage: true });
  await page.getByRole('button', { name: 'How to play ↗' }).click();
  await page.getByRole('heading', { name: 'The house rules' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: /Take your seat/ }).click();
  await page.waitForFunction(() => document.querySelector('.turn-tag')?.textContent === 'Your turn');
  await page.screenshot({ path: path.join(output, 'desktop-table.png'), fullPage: true });
  assert.equal(await page.locator('.seat').count(), 6);
  assert.equal(await page.locator('.round-analysis').count(), 0, 'no live bot notes');
  assert.equal(await page.locator('.analysis-odds').count(), 0);
  // Mobile setup and six-seat layout must fit without horizontal overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, 'mobile-table.png'), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: /Resume your saved table/ }).click();
  await page.waitForFunction(() => document.querySelector('.turn-tag')?.textContent === 'Your turn');
  assert.equal(await page.locator('.seat').count(), 6);
  // Play a complete game via real UI controls. Bots use real module workers.
  for (let i = 0; i < 300; i++) {
    await page.waitForFunction(() => document.querySelector('.reveal-panel') || document.querySelector('.turn-tag')?.textContent === 'Your turn', null, { timeout: 15000 });
    if (await page.getByRole('button', { name: /Another round of company/ }).count()) break;
    const next = page.getByRole('button', { name: /Next round ·/ });
    if (await next.count()) { await next.click(); continue; }
    const direction = page.getByRole('button', { name: '↻ Clockwise', exact: true });
    if (await direction.count()) { await direction.click(); continue; }
    const tropical = page.getByRole('button', { name: 'Challenge Tropical', exact: true });
    if (await tropical.count()) { await tropical.click(); continue; }
    const dudo = page.getByRole('button', { name: 'It’s a lie!', exact: true });
    if (await dudo.count()) { await dudo.click(); continue; }
    await page.getByRole('button', { name: /^Bid \d+ ×/ }).click();
  }
  await page.getByRole('button', { name: /Another round of company/ }).waitFor({ timeout: 15000 });
  const completed = JSON.parse(await page.evaluate(() => localStorage.getItem('its-a-lie:v1')));
  assert.equal(replay(completed).phase, 'gameOver');
  await writeFile(path.join(output, 'completed-game.json'), JSON.stringify(completed, null, 2));
  await page.screenshot({ path: path.join(output, 'mobile-result.png'), fullPage: true });
  // Export uses a browser download with a valid complete replay.
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export replay/ }).click();
  const download = await downloadEvent;
  const exported = path.join(output, 'exported.json'); await download.saveAs(exported);
  assert.equal(replay(JSON.parse(await readFile(exported, 'utf8'))).phase, 'gameOver');
  const chooserEvent = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import replay', exact: true }).click();
  await (await chooserEvent).setFiles(exported);
  await page.getByText('Replay loaded. You can continue from here.', { exact: true }).waitFor();
  // An isolated deterministic coaching position: no opponent hands enter the UI
  // calculator. The human has no twos/aces and faces eleven twos among 30 dice.
  let coachConfig, coachState;
  for (let i = 0; i < 1000; i++) {
    coachConfig = { seats: 6, seed: `coach-demo-${i}` };
    coachState = newGame(coachConfig);
    if (coachState.host === 0 && coachState.players[0].dice.every(d => d !== 1 && d !== 2)) break;
  }
  const coachActions = [
    { actor: 0, action: { type: 'direction', direction: 1 } },
    { actor: 0, action: { type: 'bid', bid: { qty: 1, face: 2 } } },
    ...[[1, 2], [2, 4], [3, 6], [4, 8], [5, 11]].map(([actor, qty]) => ({ actor, action: { type: 'bid', bid: { qty, face: 2 } } })),
  ];
  await page.evaluate(value => localStorage.setItem('its-a-lie:v1', value), JSON.stringify({ version: VERSION, config: coachConfig, actions: coachActions }));
  await page.reload();
  await page.getByRole('button', { name: /Resume your saved table/ }).click();
  await page.getByRole('button', { name: 'Show odds', exact: true }).click();
  assert.equal(await page.locator('[data-raw="dudo"]').textContent(), '82.2%');
  const raw = Number.parseFloat(await page.locator('[data-raw="covered"]').textContent());
  assert(Number.parseFloat(await page.locator('[data-soft="covered"]').textContent()) > raw);
  await page.locator('#support-matches').selectOption('2');
  assert.equal(await page.locator('[data-soft="dudo"]').textContent(), '80.5%');
  await page.locator('#support-weight').press('Home');
  assert.equal(await page.locator('[data-soft="dudo"]').textContent(), '82.2%');
  await page.locator('#support-toggle').uncheck();
  assert.equal(await page.locator('[data-soft]').count(), 0);
  assert.equal(await page.locator('#support-matches').isDisabled(), true);
  await page.locator('#support-toggle').check();
  for (let i = 0; i < 4; i++) await page.locator('#support-weight').press('ArrowRight');
  await page.locator('.odds-math summary').click();
  await page.getByRole('button', { name: 'Bid 6s', exact: true }).click();
  assert.equal(await page.locator('#odds-draft-label').textContent(), '11 × 6s');
  assert.equal(await page.locator('[data-draft-raw="covered"]').textContent(), '46.2%');
  assert.equal(await page.locator('.odds-math').getAttribute('open'), '');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, 'mobile-odds.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: path.join(output, 'desktop-odds.png'), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: /Resume your saved table/ }).click();
  assert.equal(await page.locator('#odds-coach').isVisible(), true, 'coach preferences survive reload');
  assert.equal(await page.locator('#support-matches').inputValue(), '2');
  await page.getByRole('button', { name: 'Hide odds', exact: true }).click();
  assert.equal(await page.locator('#odds-coach').count(), 0);
  // A recorded Tropical challenge must reveal exactly one cup.
  let config, state;
  for (let i = 0; i < 100; i++) {
    config = { seats: 2, seed: `partial-${i}` }; state = newGame(config);
    if (state.round.turn === 0) break;
  }
  const actions = [{ actor: 0, action: { type: 'tropical' } }, { actor: 1, action: { type: 'tropicalLie' } }];
  for (const record of actions) state = applyAction(state, record.actor, record.action);
  const partial = { version: VERSION, config, actions };
  await page.evaluate(value => localStorage.setItem('its-a-lie:v1', value), JSON.stringify(partial));
  await page.reload(); await page.getByRole('button', { name: /Resume your saved table/ }).click();
  await page.getByText('Only the Tropical declarer’s cup is revealed. Private bot analysis stays hidden.', { exact: true }).waitFor();
  assert.equal(await page.locator('.round-analysis').count(), 0);
  assert.equal(await page.locator('.reveal-player .hidden-die').count(), 5);
  await page.getByRole('button', { name: 'New table', exact: true }).click();
  await page.getByRole('button', { name: 'Set up a new table', exact: true }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, 'mobile-setup.png'), fullPage: true });
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  console.log(JSON.stringify({ result: 'PASS', completedActions: completed.actions.length, tests: ['desktop', 'mobile', 'six seats', 'real workers', 'full game', 'save/resume', 'export/import', 'live odds', 'soft support controls', 'draft updates', 'coach preference persistence', 'partial-reveal privacy', 'repository subpath'], screenshots: output }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
