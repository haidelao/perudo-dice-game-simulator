// A player-facing calculator. Only a seat's observation is accepted; this module
// never receives GameState, actual opponent hands, or the game's dice seed.
import { binomial, hands } from './ai.js';
import { countFace } from './engine.js';

const clamp = value => Math.max(0, Math.min(1, value));

function summary(distribution, known, quantity) {
  const needed = quantity - known;
  const covered = needed <= 0 ? 1 : clamp(distribution.slice(needed).reduce((sum, value) => sum + value, 0));
  return {
    covered, dudo: 1 - covered, exact: clamp(distribution[needed] ?? 0),
    expected: known + distribution.reduce((sum, value, count) => sum + count * value, 0),
  };
}

export function calculateClaimOdds(obs, bid, { enabled = true, minimumMatches = 1, weight = .2 } = {}) {
  if (!bid || !Number.isInteger(bid.qty) || bid.qty < 1 || !Number.isInteger(bid.face) || bid.face < 1 || bid.face > 6) throw new Error('Invalid claim');
  if (![1, 2].includes(minimumMatches) || !Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error('Invalid support assumption');
  const total = obs.players.reduce((sum, player) => sum + player.count, 0);
  const visible = obs.myDice ?? [];
  const known = countFace(visible, bid.face);
  const unknown = total - visible.length;
  const p = bid.face === 1 ? 1 / 6 : 1 / 3;
  const distribution = binomial(unknown, p);
  const raw = summary(distribution, known, bid.qty);
  const assumption = {
    applied: false, reason: '', bidder: obs.round.bidder, face: obs.round.bid?.face ?? null,
    minimumMatches, weight, eventProbability: null,
  };
  const result = {
    raw, adjusted: { ...raw }, supported: null, assumption,
    math: { total, visible: visible.length, known, unknown, needed: bid.qty - known, p },
  };
  if (!enabled || weight === 0) { assumption.reason = 'Support adjustment is off.'; return result; }
  if (!obs.round.bid || !Number.isInteger(obs.round.bidder)) { assumption.reason = 'No standing bidder to make an assumption about yet.'; return result; }
  const bidder = obs.players[obs.round.bidder];
  if (bidder.id === obs.me) { assumption.reason = 'This is your own bid. Your visible dice are already counted; no extra support is assumed.'; return result; }
  if (obs.round.blind && bidder.count >= 2) { assumption.reason = 'The bidder is blind. Their bid is not evidence about their unseen hand.'; return result; }
  if (minimumMatches > bidder.count) { assumption.reason = `The bidder has only ${bidder.count} die. Choose a one-match assumption.`; return result; }

  // Condition ONE opponent cup, not the entire unknown pool. The rest remain
  // random. Enumerating actual face multisets also handles a different draft
  // face correctly: support for twos is not extra support for every other face.
  const possible = hands(bidder.count).filter(entry => countFace(entry.dice, assumption.face) >= minimumMatches);
  const eventProbability = possible.reduce((sum, entry) => sum + entry.weight, 0);
  const remaining = binomial(unknown - bidder.count, p);
  const conditional = Array(unknown + 1).fill(0);
  for (const entry of possible) {
    const contribution = countFace(entry.dice, bid.face);
    const probability = entry.weight / eventProbability;
    for (let count = 0; count < remaining.length; count++) conditional[count + contribution] += probability * remaining[count];
  }
  const mixture = distribution.map((value, count) => (1 - weight) * value + weight * conditional[count]);
  result.supported = summary(conditional, known, bid.qty);
  result.adjusted = summary(mixture, known, bid.qty);
  assumption.applied = true;
  assumption.eventProbability = eventProbability;
  return result;
}
