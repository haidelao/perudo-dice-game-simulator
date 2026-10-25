import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateClaimOdds } from '../src/odds.js';
import { newGame, observation, countFace } from '../src/engine.js';

const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
function view({ hand = [4, 4, 5, 6, 6], counts = [5, 5, 5, 5, 5, 5], face = 2, qty = 11, bidder = 1, blind = false } = {}) {
  return {
    me: 0, myDice: hand,
    players: counts.map((count, id) => ({ count, id, name: `Seat ${id}` })),
    round: { bid: { qty, face }, bidder, blind },
  };
}

test('coaching reproduces the real 30-dice example without reading hidden hands', () => {
  const result = calculateClaimOdds(view(), { qty: 11, face: 2 });
  close(result.raw.covered, .17798535749245817);
  close(result.raw.dudo, .8220146425075418);
  close(result.raw.exact, .0861926394218959);
  assert.deepEqual(result.math, { total: 30, visible: 5, known: 0, unknown: 25, needed: 11, p: 1 / 3 });
  assert(result.adjusted.covered > result.raw.covered);
  assert(result.adjusted.dudo < result.raw.dudo);
  close(result.adjusted.covered, .8 * result.raw.covered + .2 * result.supported.covered);
});

test('conditioning one two-die cup has an analytically checkable result', () => {
  const obs = view({ hand: [], counts: [0, 2], qty: 1 });
  const result = calculateClaimOdds(obs, { qty: 1, face: 2 }, { minimumMatches: 1, weight: .2 });
  close(result.raw.covered, 5 / 9);
  close(result.supported.covered, 1);
  close(result.supported.exact, 4 / 5);
  close(result.supported.expected, 6 / 5);
  close(result.assumption.eventProbability, 5 / 9);
  close(result.adjusted.covered, .8 * 5 / 9 + .2);
});

test('two-support scenario fixes only the supported count, not additional dice', () => {
  const obs = view({ hand: [1], counts: [1, 2, 1], qty: 3, face: 4 });
  const result = calculateClaimOdds(obs, { qty: 3, face: 4 }, { minimumMatches: 2, weight: 1 });
  close(result.supported.covered, 1);
  close(result.supported.exact, 2 / 3);
  assert.equal(result.math.unknown, 3);
  close(result.supported.expected, 1 + 2 + 1 / 3);
});

test('joint-face conditioning agrees with exhaustive ordered dice enumeration', () => {
  const obs = view({ hand: [3], counts: [1, 2, 1], face: 2, qty: 2 });
  for (const target of [1, 2, 3, 6]) for (const minimumMatches of [1, 2]) {
    let accepted = 0, covered = 0, exact = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
      if (countFace([a, b], 2) < minimumMatches) continue;
      const count = countFace([3, a, b, c], target);
      accepted++; covered += Number(count >= 2); exact += Number(count === 2);
    }
    const result = calculateClaimOdds(obs, { qty: 2, face: target }, { minimumMatches, weight: 1 });
    close(result.supported.covered, covered / accepted);
    close(result.supported.exact, exact / accepted);
  }
});

test('off and zero-weight settings return exactly the raw probabilities', () => {
  for (const settings of [{ enabled: false }, { weight: 0 }]) {
    const result = calculateClaimOdds(view(), { qty: 11, face: 2 }, settings);
    assert.deepEqual(result.adjusted, result.raw);
    assert.equal(result.assumption.applied, false);
  }
});

test('no imaginary support is assumed for a blind bidder, own bid, or undersized cup', () => {
  for (const obs of [view({ blind: true }), view({ bidder: 0 }), view({ counts: [5, 1] })]) {
    const result = calculateClaimOdds(obs, { qty: 3, face: 2 }, { minimumMatches: 2 });
    assert.equal(result.assumption.applied, false);
    assert.deepEqual(result.adjusted, result.raw);
    assert(result.assumption.reason);
  }
});

test('human blind dice remain unknown; a visible one-die bidder can supply evidence', () => {
  const obs = view({ hand: null, counts: [5, 1], qty: 2, blind: true });
  const result = calculateClaimOdds(obs, { qty: 2, face: 2 });
  assert.equal(result.math.unknown, 6);
  assert.equal(result.math.known, 0);
  assert.equal(result.assumption.applied, true);
});

test('support increases same-face coverage and preserves valid probabilities', () => {
  for (const face of [1, 4]) for (let qty = 1; qty <= 30; qty++) for (const minimumMatches of [1, 2]) {
    const result = calculateClaimOdds(view({ face }), { qty, face }, { minimumMatches, weight: .35 });
    assert(result.adjusted.covered >= result.raw.covered - 1e-12);
    for (const value of [result.raw, result.adjusted, result.supported]) {
      close(value.covered + value.dudo, 1);
      assert(value.exact >= 0 && value.exact <= value.covered + 1e-12);
    }
  }
});

test('known coverage is certain, impossible claims are zero, and own aces count correctly', () => {
  const obs = view({ hand: [1, 1, 4], counts: [3, 2], face: 4, qty: 1 });
  close(calculateClaimOdds(obs, { qty: 3, face: 4 }).raw.covered, 1);
  close(calculateClaimOdds(obs, { qty: 6, face: 4 }).raw.covered, 0);
  const ace = calculateClaimOdds(obs, { qty: 3, face: 1 });
  assert.equal(ace.math.known, 2);
  close(ace.raw.covered, 1 - (5 / 6) ** 2);
});

test('no standing bidder means a raw-only draft, with an explicit explanation', () => {
  const obs = view(); obs.round.bid = null; obs.round.bidder = null;
  const result = calculateClaimOdds(obs, { qty: 5, face: 6 });
  assert.equal(result.assumption.applied, false);
  assert.match(result.assumption.reason, /No standing bidder/);
});

test('changing opponents dice or random state cannot affect coach output', () => {
  const state = newGame({ seats: 3, seed: 'coach-privacy' });
  state.phase = 'bidding'; state.round.bid = { qty: 6, face: 3 }; state.round.bidder = 1;
  const before = calculateClaimOdds(observation(state, 0), state.round.bid);
  state.players[1].dice = [1, 1, 1, 1, 1]; state.players[2].dice = [6, 6, 6, 6, 6]; state.rngState = 0;
  assert.deepEqual(calculateClaimOdds(observation(state, 0), state.round.bid), before);
});
