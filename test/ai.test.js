import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binomial, odds, hands, posterior, decide, learn, validateDecision } from '../src/ai.js';
import { newGame, observation, applyAction, legalActions } from '../src/engine.js';

test('binomial and multinomial distributions normalise', () => {
  for (let n = 0; n <= 30; n++) for (const p of [1 / 6, 1 / 3]) assert(Math.abs(binomials(n, p) - 1) < 1e-10);
  function binomials(n, p) { return binomial(n, p).reduce((a, b) => a + b, 0); }
  assert.deepEqual([1, 2, 3, 4, 5].map(n => hands(n).length), [6, 21, 56, 126, 252]);
  for (let n = 0; n <= 5; n++) assert(Math.abs(hands(n).reduce((s, h) => s + h.weight, 0) - 1) < 1e-10);
  assert.equal(odds([2, 2], 2, 2, { qty: 2, face: 2 }).exact, 1);
  assert.equal(odds([2, 2], 2, 2, { qty: 1, face: 1 }).covered, 0);
  assert(Math.abs(odds(null, 5, 5, { qty: 1, face: 2 }).covered - (1 - (2 / 3) ** 5)) < 1e-12);
});
test('empty history matches hand priors; blind bids carry no hand evidence', () => {
  let state = newGame({ seats: 3, seed: 'beliefs' }); state.phase = 'bidding'; state.round.turn = 0;
  let obs = observation(state, 0);
  assert.deepEqual(posterior(obs, 1), hands(5));
  obs.round.blind = true; obs.round.history.push({ player: 1, action: { type: 'bid', bid: { qty: 12, face: 6 } } });
  assert.deepEqual(posterior(obs, 1), hands(5));
});
test('hidden-hand changes cannot affect a bot decision', () => {
  const state = newGame({ seats: 4, seed: 'no-leak' }); state.phase = 'bidding'; state.round.turn = 1;
  const obs = observation(state, 1);
  const before = decide(obs, {}, 'fixed');
  state.players[0].dice = [6, 6, 6, 6, 6]; state.players[2].dice = [1, 1, 1, 1, 1];
  const after = decide(observation(state, 1), {}, 'fixed');
  assert.deepEqual(after, before); assert(validateDecision(obs, after));
});
test('a bot challenges a provably impossible bid', () => {
  const state = newGame({ seats: 2, seed: 'obvious' });
  state.phase = 'bidding'; state.round.turn = 1;
  state.players[1].dice = [2, 2, 2, 2, 2];
  state.round.bid = { qty: 10, face: 6 }; state.round.bidder = 0;
  for (let i = 0; i < 10; i++) assert.equal(decide(observation(state, 1), {}, `call-${i}`).action.type, 'dudo');
});
test('partial reveals teach only visible hands; blind hands do not teach false tells', () => {
  const reveal = { hands: [[1, 2, 3, 4, 5], null, null], countsBefore: [5, 5, 5], blind: false, history: [{ player: 0, action: { type: 'tropical' } }, { player: 1, action: { type: 'bid', bid: { qty: 2, face: 6 } } }] };
  const learned = learn({}, reveal);
  assert(learned[0]); assert.equal(learned[1], undefined); assert.equal(learned[2], undefined);
  assert.deepEqual(learn({}, { ...reveal, blind: true }), {});
});
test('bot actions remain legal through changing hands, blind and Shootout', () => {
  let state = newGame({ seats: 3, seed: 'ai-play', difficulty: 'relaxed' });
  for (let step = 0; step < 350 && state.phase !== 'gameOver'; step++) {
    if (state.phase === 'reveal') { state = applyAction(state, 0, { type: 'next' }); continue; }
    const actor = state.round.turn;
    const obs = observation(state, actor);
    const result = decide(obs, {}, `s-${step}`);
    assert(validateDecision(obs, result));
    assert(legalActions(state, actor).length > 0);
    state = applyAction(state, actor, result.action);
  }
  assert.equal(state.phase, 'gameOver');
});
