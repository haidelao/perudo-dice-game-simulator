import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, applyAction, legalBid, legalActions, minAces, countFace, isTropical, observation, replay, VERSION, actionKey } from '../src/engine.js';
import { roll, random } from '../src/random.js';

function position(hands = [[2, 3, 4, 5, 6], [2, 2, 3, 3, 4], [4, 4, 5, 6, 6]]) {
  const game = newGame({ seats: hands.length, seed: 'fixture' });
  game.phase = 'bidding';
  game.players.forEach((p, id) => { p.dice = hands[id]; p.count = hands[id].length; });
  game.round.turn = 0; game.round.starter = 0; game.round.bid = null; game.round.bidder = null;
  return game;
}
function bid(game, actor, qty, face) { return applyAction(game, actor, { type: 'bid', bid: { qty, face } }); }

test('house ace transitions and capped, integer bid legality', () => {
  assert.deepEqual([8, 9, 10, 11].map(minAces), [5, 5, 6, 6]);
  assert.equal(legalBid({ qty: 8, face: 4 }, { qty: 4, face: 1 }, 20), false);
  assert.equal(legalBid({ qty: 8, face: 4 }, { qty: 5, face: 1 }, 20), true);
  assert.equal(legalBid({ qty: 5, face: 1 }, { qty: 10, face: 2 }, 20), true);
  assert.equal(legalBid({ qty: 5, face: 1 }, { qty: 9, face: 6 }, 20), false);
  assert.equal(legalBid(null, { qty: 1, face: 1 }, 10), false);
  assert.equal(legalBid(null, { qty: 1, face: 1 }, 10, { openingAces: true }), true);
  for (const invalid of [{ qty: 1.5, face: 2 }, { qty: 21, face: 2 }, { qty: 1, face: 7 }, { qty: -1, face: 2 }]) assert.equal(legalBid(null, invalid, 20), false);
});
test('wild aces and five distinct dice', () => {
  assert.equal(countFace([1, 1, 4, 5, 6], 4), 3);
  assert.equal(countFace([1, 1, 4, 5, 6], 1), 2);
  assert.equal(isTropical([1, 2, 3, 4, 5]), true);
  assert.equal(isTropical([1, 2, 3, 4, 4]), false);
});
test('covered and uncovered Dudo, loss and next starter', () => {
  const state = position();
  const covered = applyAction(bid(state, 0, 1, 2), 1, { type: 'dudo' });
  assert.equal(covered.reveal.loser, 1); assert.equal(covered.players[1].count, 4);
  assert.equal(covered.reveal.nextStarter, 1);
  const notCovered = applyAction(bid(state, 0, 15, 6), 1, { type: 'dudo' });
  assert.equal(notCovered.reveal.loser, 0); assert.equal(notCovered.reveal.count, 3);
  assert.equal(state.players[0].count, 5, 'previous state was not mutated');
});
test('Calza eligibility, gain, failure, and round transition', () => {
  let state = position([[2, 2, 3], [2, 4, 4, 5], [3, 5, 6]]);
  state = bid(state, 0, 3, 2);
  assert(legalActions(state).some(a => a.type === 'calza'));
  const correct = applyAction(state, 1, { type: 'calza' });
  assert.equal(correct.players[1].count, 5); assert.equal(correct.reveal.gainer, 1); assert.equal(correct.reveal.nextStarter, 1);
  const wrong = applyAction(bid(position([[2, 3, 3], [4, 4], [6]]), 0, 3, 2), 1, { type: 'calza' });
  assert.equal(wrong.players[1].count, 1); assert.equal(wrong.reveal.correct, false);
  const full = bid(position(), 0, 1, 2);
  assert(!legalActions(full).some(a => a.type === 'calza'));
});
test('Tropical restricts response, preserves standing bid, and reveals one cup', () => {
  let state = applyAction(position(), 0, { type: 'tropical' });
  assert(legalActions(state).some(a => a.type === 'tropicalLie'));
  assert(!legalActions(state).some(a => ['dudo', 'calza', 'tropical'].includes(a.type)));
  const result = applyAction(state, 1, { type: 'tropicalLie' });
  assert.equal(result.reveal.loser, 1);
  assert.deepEqual(result.reveal.hands, [[2, 3, 4, 5, 6], null, null]);
  state = bid(state, 1, 1, 3);
  assert.equal(state.round.tropicalPending, null);
  assert.equal(state.round.bidder, 1);
  let standing = bid(position(), 0, 3, 2);
  standing = applyAction(standing, 1, { type: 'tropical' });
  assert.deepEqual(standing.round.bid, { qty: 3, face: 2 });
  const bluff = applyAction(standing, 2, { type: 'tropicalLie' });
  assert.equal(bluff.reveal.loser, 1);
});
test('Tropical is once per player per round and a max bid still has a challenge', () => {
  let state = applyAction(position(), 0, { type: 'tropical' });
  state = bid(state, 1, 1, 2); state = bid(state, 2, 1, 3);
  assert(!legalActions(state).some(a => a.type === 'tropical'));
  state = bid(state, 0, 15, 1); state = applyAction(state, 1, { type: 'tropical' });
  assert.deepEqual(legalActions(state), [{ type: 'tropicalLie' }]);
});
test('blind triggers once, affects only next round and hides 2+ dice', () => {
  let state = position([[2, 3, 4], [2, 4], [2, 3, 4]]);
  state = applyAction(bid(state, 0, 1, 2), 1, { type: 'dudo' });
  assert.equal(state.reveal.blindNext, true); assert.equal(state.blindTriggered, true);
  state = applyAction(state, 0, { type: 'next' });
  assert.equal(state.round.blind, true);
  assert.equal(observation(state, 0).myDice, null);
  assert.equal(observation(state, 1).myDice.length, 1);
  state = applyAction(state, state.round.turn, { type: 'direction', direction: 1 });
  state = bid(state, state.round.turn, 1, 2);
  state = applyAction(state, state.round.turn, { type: 'dudo' });
  assert.equal(state.reveal.blindNext, false);
});
test('Shootout persists through a reduced field and eliminates outright', () => {
  let state = position([[2], [2], [2]]);
  state.shootoutActive = true; state.players.forEach(p => { p.count = 5; p.dice = [2, 2, 2, 2, 2]; });
  state = applyAction(bid(state, 0, 1, 2), 1, { type: 'dudo' });
  assert.equal(state.players[1].count, 0);
  state = applyAction(state, 0, { type: 'next' });
  assert.equal(state.shootoutActive, true); assert.deepEqual(state.players.map(p => p.count), [5, 0, 5]);
  state = applyAction(bid(state, state.round.turn, 10, 6), state.round.turn === 0 ? 2 : 0, { type: 'dudo' });
  assert.equal(state.phase, 'gameOver');
});
test('all one-die players trigger Shootout at round boundary', () => {
  let state = position([[2], [2, 4], [3]]);
  state = applyAction(bid(state, 0, 1, 2), 1, { type: 'dudo' });
  state = applyAction(state, 0, { type: 'next' });
  assert.equal(state.shootoutActive, true);
  assert.deepEqual(state.players.map(p => p.count), [5, 5, 5]);
  assert.equal(state.round.blind, true, 'blind and Shootout may coincide under the chosen rules');
});
test('eliminated starter uses previous direction and wrong actor is rejected', () => {
  let state = position([[2], [2, 4], [3]]); state.round.direction = -1;
  state = bid(state, 0, 4, 6);
  assert.throws(() => applyAction(state, 1, { type: 'dudo' }), /Illegal/);
  state = applyAction(state, 2, { type: 'dudo' });
  assert.equal(state.players[0].count, 0); assert.equal(state.reveal.nextStarter, 2);
});
test('observation has no dice seed, other hands, or random state', () => {
  const state = position();
  const seen = observation(state, 0);
  assert(!('seed' in seen)); assert(!('rngState' in seen));
  assert(seen.players.every(p => !('dice' in p)));
  assert.deepEqual(seen.myDice, state.players[0].dice);
  seen.myDice[0] = 6; assert.equal(state.players[0].dice[0], 2);
});
test('seeded full replays are identical, legal raises increase and games finish', () => {
  const rng = random('test-actions');
  for (let seats = 2; seats <= 6; seats++) {
    const config = { seats, seed: `property-${seats}` };
    let state = newGame(config); const actions = [];
    for (let step = 0; state.phase !== 'gameOver' && step < 10000; step++) {
      const actor = state.phase === 'reveal' ? 0 : state.round.turn;
      const legal = legalActions(state, actor);
      assert(legal.length > 0, 'no dead end');
      for (const a of legal.filter(a => a.type === 'bid')) assert(legalBid(state.round.bid, a.bid, state.players.reduce((n, p) => n + p.count, 0), state.rules));
      const action = legal[Math.floor(rng() * legal.length)];
      actions.push({ actor, action }); state = applyAction(state, actor, action);
      assert(state.players.every(p => p.count >= 0 && p.count <= 5));
    }
    assert.equal(state.phase, 'gameOver');
    assert.deepEqual(replay({ version: VERSION, config, actions }), state);
    assert.equal(state.players.filter(p => p.count > 0).length, 1);
  }
});
test('RNG repeatability and rough face balance', () => {
  assert.deepEqual(roll(123, 100), roll(123, 100));
  const { dice } = roll(45, 60000);
  for (let f = 1; f <= 6; f++) assert(Math.abs(dice.filter(d => d === f).length - 10000) < 400);
});
test('disabled optional rules remove their actions and transitions', () => {
  const config = { seats: 3, seed: 'off', rules: { tropical: false, calza: false, blind: false, shootout: false, openingAces: true } };
  let state = newGame(config); state.phase = 'bidding'; state.round.turn = 0;
  state.players[1].count = 2; state.players[1].dice = [2, 2];
  assert(legalActions(state).some(a => actionKey(a) === 'bid:1:1'));
  assert(!legalActions(state).some(a => a.type === 'tropical'));
  state = bid(state, 0, 1, 2);
  assert(!legalActions(state).some(a => a.type === 'calza'));
  state = applyAction(state, 1, { type: 'dudo' });
  assert.equal(state.reveal.blindNext, false);
});
