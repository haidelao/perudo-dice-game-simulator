import { hash, roll } from './random.js';

export const VERSION = 1;
export const DEFAULT_RULES = Object.freeze({
  openingAces: false, tropical: true, calza: true, blind: true, shootout: true,
});
export const BOT_NAMES = ['Maya', 'Theo', 'Jules', 'Nico', 'Ada'];
export const STYLES = ['reader', 'bold', 'balanced', 'careful', 'tricky'];

export function countFace(dice, face) {
  return dice.filter(d => d === face || (face !== 1 && d === 1)).length;
}
export function isTropical(dice) { return dice.length === 5 && new Set(dice).size === 5; }
export function minAces(qty) { return Math.floor(qty / 2) + 1; }
export function legalBid(prev, bid, total, rules = DEFAULT_RULES) {
  if (!bid || !Number.isInteger(bid.qty) || bid.qty < 1 || bid.qty > total ||
      !Number.isInteger(bid.face) || bid.face < 1 || bid.face > 6) return false;
  if (!prev) return bid.face !== 1 || rules.openingAces;
  if (bid.face === 1) return prev.face === 1 ? bid.qty > prev.qty : bid.qty >= minAces(prev.qty);
  if (prev.face === 1) return bid.qty >= prev.qty * 2;
  return bid.qty > prev.qty || (bid.qty === prev.qty && bid.face > prev.face);
}
export function nextPlayer(state, from, direction = state.round.direction) {
  for (let n = 1; n <= state.players.length; n++) {
    const id = (from + direction * n + state.players.length * n) % state.players.length;
    if (state.players[id].count > 0) return id;
  }
  throw new Error('No active players');
}
export function totalDice(state) { return state.players.reduce((n, p) => n + p.count, 0); }

function startRound(state, starter, blind = false) {
  const active = state.players.filter(p => p.count > 0);
  if (state.rules.shootout && active.length > 1 && active.every(p => p.count === 1)) state.shootoutActive = true;
  if (state.shootoutActive) for (const p of active) p.count = 5;
  for (const p of state.players) {
    const result = roll(state.rngState, p.count);
    state.rngState = result.state;
    p.dice = result.dice;
  }
  state.round = {
    number: (state.round?.number ?? 0) + 1, starter, turn: starter, direction: 1,
    bid: null, bidder: null, tropicalPending: null, usedTropical: [], history: [], blind,
  };
  state.phase = active.length === 2 ? 'bidding' : 'direction';
  state.reveal = null;
  return state;
}

export function newGame({ seats = 4, name = 'You', difficulty = 'social', seed = 'perudo', rules = {} } = {}) {
  if (!Number.isInteger(seats) || seats < 2 || seats > 6) throw new Error('Choose 2–6 players');
  if (!['relaxed', 'social', 'sharp'].includes(difficulty)) throw new Error('Unknown difficulty');
  if (typeof seed !== 'string' || seed.length > 200) throw new Error('Invalid seed');
  for (const [key, value] of Object.entries(rules)) {
    if (!(key in DEFAULT_RULES) || typeof value !== 'boolean') throw new Error('Invalid rule');
  }
  const state = {
    version: VERSION, seed, difficulty, rules: { ...DEFAULT_RULES, ...rules },
    players: Array.from({ length: seats }, (_, id) => ({
      id, name: id === 0 ? String(name).trim().slice(0, 24) || 'You' : BOT_NAMES[id - 1],
      kind: id === 0 ? 'human' : 'bot', style: id === 0 ? 'human' : STYLES[id - 1], count: 5, dice: [],
    })),
    rngState: hash(seed), blindTriggered: false, shootoutActive: false,
    round: null, reveal: null, winner: null, phase: 'host', hostRolls: [], placements: [],
  };
  let tied = state.players.map(p => p.id);
  while (tied.length > 1) {
    const scores = tied.map(id => {
      const result = roll(state.rngState, 1);
      state.rngState = result.state;
      return { id, face: result.dice[0] };
    });
    state.hostRolls.push(scores);
    const best = Math.max(...scores.map(s => s.face));
    tied = scores.filter(s => s.face === best).map(s => s.id);
  }
  state.host = tied[0];
  return startRound(state, state.host);
}

export function legalActions(state, actor = state.round.turn) {
  if (state.phase === 'gameOver') return [];
  if (state.phase === 'reveal') return actor === 0 ? [{ type: 'next' }] : [];
  if (actor !== state.round.turn || state.players[actor].count === 0) return [];
  if (state.phase === 'direction') return [{ type: 'direction', direction: 1 }, { type: 'direction', direction: -1 }];
  const actions = [];
  const r = state.round;
  for (let qty = 1; qty <= totalDice(state); qty++) for (let face = 1; face <= 6; face++) {
    if (legalBid(r.bid, { qty, face }, totalDice(state), state.rules)) actions.push({ type: 'bid', bid: { qty, face } });
  }
  if (r.tropicalPending !== null) actions.push({ type: 'tropicalLie' });
  else {
    if (r.bid) {
      actions.push({ type: 'dudo' });
      if (state.rules.calza && state.players[actor].count < 5) actions.push({ type: 'calza' });
    }
    if (state.rules.tropical && state.players[actor].count === 5 && !r.usedTropical.includes(actor)) actions.push({ type: 'tropical' });
  }
  return actions;
}
export function actionKey(action) {
  if (action.type === 'bid') return `bid:${action.bid?.qty}:${action.bid?.face}`;
  if (action.type === 'direction') return `direction:${action.direction}`;
  return action.type;
}

function finishRound(state, actor, action) {
  const r = state.round;
  const hands = state.players.map(p => [...p.dice]);
  let loser = null, gainer = null, count = null, correct;
  if (action.type === 'tropicalLie') {
    correct = !isTropical(hands[r.tropicalPending]);
    loser = correct ? r.tropicalPending : actor;
  } else {
    count = hands.reduce((n, hand) => n + countFace(hand, r.bid.face), 0);
    if (action.type === 'dudo') {
      correct = count < r.bid.qty;
      loser = correct ? r.bidder : actor;
    } else {
      correct = count === r.bid.qty;
      if (correct) gainer = actor;
      else loser = actor;
    }
  }
  let blindNext = false;
  if (loser !== null) {
    const p = state.players[loser];
    p.count = state.shootoutActive ? 0 : p.count - 1;
    if (p.count === 0) state.placements.push(loser);
    if (state.rules.blind && !state.blindTriggered && p.count === 1) {
      state.blindTriggered = true;
      blindNext = true;
    }
  }
  if (gainer !== null) state.players[gainer].count = Math.min(5, state.players[gainer].count + 1);
  const starterCandidate = loser ?? gainer;
  const nextStarter = state.players[starterCandidate].count > 0 ? starterCandidate : nextPlayer(state, starterCandidate);
  // A Tropical challenge reveals only the declarer. Discarded cups remain private.
  const visibleHands = hands.map((hand, id) => action.type !== 'tropicalLie' || id === r.tropicalPending ? hand : null);
  state.reveal = {
    round: r.number, type: action.type, actor, bidder: r.bidder, bid: r.bid ? { ...r.bid } : null,
    declarer: r.tropicalPending, hands: visibleHands, history: structuredClone(r.history),
    countsBefore: hands.map(h => h.length), blind: r.blind, count, correct,
    loser, gainer, nextStarter, blindNext, shootout: state.shootoutActive,
  };
  const active = state.players.filter(p => p.count > 0);
  if (active.length === 1) { state.winner = active[0].id; state.phase = 'gameOver'; }
  else state.phase = 'reveal';
}

export function applyAction(previous, actor, action) {
  if (!action || !legalActions(previous, actor).some(a => actionKey(a) === actionKey(action))) throw new Error('Illegal action');
  const state = structuredClone(previous);
  // Canonical action drops caller-supplied fields from saved logs.
  action = legalActions(previous, actor).find(a => actionKey(a) === actionKey(action));
  if (action.type === 'next') return startRound(state, state.reveal.nextStarter, state.reveal.blindNext);
  const r = state.round;
  r.history.push({ player: actor, action: structuredClone(action) });
  if (action.type === 'direction') {
    r.direction = action.direction;
    state.phase = 'bidding';
  } else if (action.type === 'bid') {
    r.bid = { ...action.bid };
    r.bidder = actor;
    r.tropicalPending = null;
    r.turn = nextPlayer(state, actor);
  } else if (action.type === 'tropical') {
    r.usedTropical.push(actor);
    r.tropicalPending = actor;
    r.turn = nextPlayer(state, actor);
  } else finishRound(state, actor, action);
  return state;
}

export function observation(state, me) {
  const ownBlind = state.round.blind && state.players[me].count >= 2;
  return {
    me, myDice: ownBlind ? null : [...state.players[me].dice],
    players: state.players.map(({ id, name, kind, style, count }) => ({ id, name, kind, style, count })),
    round: structuredClone(state.round), rules: { ...state.rules }, phase: state.phase,
    shootout: state.shootoutActive, difficulty: state.difficulty,
    legalActions: legalActions(state, me),
  };
}

export function replay(log) {
  if (log?.version !== VERSION || !Array.isArray(log.actions) || log.actions.length > 50000) throw new Error('Unsupported replay');
  let state = newGame(log.config);
  for (const record of log.actions) state = applyAction(state, record.actor, record.action);
  return state;
}
