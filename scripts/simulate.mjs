import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { newGame, applyAction, observation } from '../src/engine.js';
import { decide, learn, validateDecision } from '../src/ai.js';
const games = Number(process.argv[2] ?? 60);
if (!Number.isInteger(games) || games < 1 || games > 10000) throw new Error('Choose 1–10000 games');
const wins = Array(6).fill(0), latencies = [];
let moves = 0, maxRounds = 0, shootouts = 0, blindRounds = 0;
for (let g = 0; g < games; g++) {
  const seats = 2 + g % 5;
  let state = newGame({ seats, seed: `smoke-${g}`, difficulty: ['relaxed', 'social', 'sharp'][g % 3] });
  state.players[0].style = ['careful', 'balanced', 'bold'][g % 3];
  let profiles = {}, step = 0;
  while (state.phase !== 'gameOver' && step++ < 8000) {
    if (state.phase === 'reveal') {
      profiles = learn(profiles, state.reveal);
      state = applyAction(state, 0, { type: 'next' });
      if (state.round.blind) blindRounds++;
      continue;
    }
    const actor = state.round.turn, obs = observation(state, actor);
    const started = performance.now();
    const result = decide(obs, profiles, `policy-${g}-${step}`);
    latencies.push(performance.now() - started);
    assert(validateDecision(obs, result), 'AI produced an illegal move');
    state = applyAction(state, actor, result.action); moves++;
    assert(state.players.every(p => p.count >= 0 && p.count <= 5));
  }
  assert.equal(state.phase, 'gameOver', `Game ${g} did not terminate`);
  wins[state.winner]++;
  maxRounds = Math.max(maxRounds, state.round.number);
  if (state.shootoutActive) shootouts++;
}
latencies.sort((a, b) => a - b);
console.log(JSON.stringify({ games, moves, winsBySeat: wins, maxRounds, shootouts, blindRounds, decisionP50Ms: +latencies[Math.floor(latencies.length * .5)].toFixed(2), decisionP95Ms: +latencies[Math.floor(latencies.length * .95)].toFixed(2), note: 'Smoke validation only; mixed table sizes and styles. Not a strength or human-realism benchmark.' }, null, 2));
