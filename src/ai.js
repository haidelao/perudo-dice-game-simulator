// Human-style probability estimates and one-response lookahead. No game state or
// dice seed enters this module. These are model estimates, not equilibrium claims.
import { countFace, isTropical, actionKey } from './engine.js';
import { random } from './random.js';

export const PERSONALITIES = {
  reader: { label: 'The reader', description: 'Watches bids, mixes patience with well-timed challenges.', call: .48, bluff: .09, temp: .055 },
  bold: { label: 'The optimist', description: 'Pushes the bidding and gives a good bluff some room.', call: .38, bluff: .16, temp: .07 },
  balanced: { label: 'The all-rounder', description: 'Plays the odds without becoming too predictable.', call: .47, bluff: .10, temp: .06 },
  careful: { label: 'The sceptic', description: 'Prefers supported bids and challenges sooner.', call: .57, bluff: .05, temp: .045 },
  tricky: { label: 'The wildcard', description: 'Changes faces, mixes things up, and occasionally steals a turn.', call: .44, bluff: .20, temp: .085 },
};

const binomials = new Map();
export function binomial(n, p) {
  const key = `${n}:${p}`;
  if (!binomials.has(key)) {
    const dist = Array(n + 1).fill(0);
    dist[0] = 1;
    for (let k = 0; k < n; k++) for (let j = k + 1; j >= 0; j--) dist[j] = (dist[j] ?? 0) * (1 - p) + (j > 0 ? dist[j - 1] * p : 0);
    binomials.set(key, dist);
  }
  return binomials.get(key);
}
export function odds(dice, ownCount, total, bid) {
  if (!bid) return { covered: 1, exact: 0 };
  const known = dice ? countFace(dice, bid.face) : 0;
  const unknown = total - (dice ? ownCount : 0);
  const dist = binomial(unknown, bid.face === 1 ? 1 / 6 : 1 / 3);
  const needed = bid.qty - known;
  return { covered: needed <= 0 ? 1 : dist.slice(needed).reduce((a, b) => a + b, 0), exact: dist[needed] ?? 0 };
}

const tables = new Map();
export function hands(count) {
  if (tables.has(count)) return tables.get(count);
  const out = [];
  const factorial = n => n < 2 ? 1 : n * factorial(n - 1);
  function visit(dice, minimum) {
    if (dice.length === count) {
      const frequencies = Array.from({ length: 6 }, (_, i) => dice.filter(d => d === i + 1).length);
      out.push({ dice, weight: factorial(count) / frequencies.reduce((v, n) => v * factorial(n), 1) / 6 ** count });
      return;
    }
    for (let d = minimum; d <= 6; d++) visit([...dice, d], d);
  }
  visit([], 1);
  tables.set(count, out);
  return out;
}

export function emptyProfiles() { return {}; }
function profileFor(profiles, id) { return profiles[id] ?? { bids: 6, supported: 4, tropicals: 3, trueTropicals: 1, calls: 4, callProbability: 2 }; }

export function learn(profiles, reveal) {
  const updated = structuredClone(profiles);
  for (let id = 0; id < reveal.hands.length; id++) {
    const dice = reveal.hands[id];
    if (!dice?.length || (reveal.blind && dice.length >= 2)) continue;
    const p = { ...profileFor(updated, id) };
    // Slow forgetting prevents a long-running profile becoming immovable.
    for (const key of Object.keys(p)) p[key] *= .97;
    let standing = null;
    const total = reveal.countsBefore.reduce((a, b) => a + b, 0);
    for (const { player, action } of reveal.history) {
      if (player === id) {
        if (action.type === 'bid') { p.bids++; p.supported += Number(countFace(dice, action.bid.face) > 0); }
        if (action.type === 'tropical') { p.tropicals++; p.trueTropicals += Number(isTropical(dice)); }
        if (action.type === 'dudo' && standing) { p.calls++; p.callProbability += odds(dice, dice.length, total, standing).covered; }
      }
      if (action.type === 'bid') standing = action.bid;
    }
    updated[id] = p;
  }
  return updated;
}

// Independent, hand-weighted beliefs under a deliberately simple behavioural
// model. Tempered updates avoid treating a few ambiguous bids as hard evidence.
export function posterior(obs, id, profiles = {}) {
  const player = obs.players[id];
  const prior = hands(player.count);
  if (obs.round.blind && player.count >= 2) return prior;
  const total = obs.players.reduce((n, p) => n + p.count, 0);
  const p = profileFor(profiles, id);
  const honesty = p.supported / Math.max(1, p.bids);
  const records = obs.round.history.filter(r => r.player === id && ['bid', 'tropical'].includes(r.action.type)).slice(-4);
  if (!records.length) return prior;
  let sum = 0;
  const weighted = prior.map(entry => {
    let weight = entry.weight;
    for (const { action } of records) {
      let likelihood;
      if (action.type === 'tropical') {
        likelihood = isTropical(entry.dice) ? .7 : Math.max(.035, (1 - p.trueTropicals / p.tropicals) * .12);
      } else {
        const supported = countFace(entry.dice, action.bid.face) > 0;
        const prob = odds(entry.dice, player.count, total, action.bid).covered;
        likelihood = (.15 + .85 * prob) * (supported ? .55 + honesty * .45 : 1 - honesty * .65);
      }
      weight *= Math.max(.01, likelihood) ** .55;
    }
    sum += weight;
    return { dice: entry.dice, weight };
  });
  return weighted.map(h => ({ dice: h.dice, weight: h.weight / sum }));
}

function draw(dist, rng) {
  let x = rng();
  for (const hand of dist) { x -= hand.weight; if (x <= 0) return hand.dice; }
  return dist.at(-1).dice;
}
const sigmoid = x => 1 / (1 + Math.exp(-x));

function activeNext(obs, direction = obs.round.direction) {
  for (let n = 1; n < obs.players.length; n++) {
    const id = (obs.me + direction * n + obs.players.length * n) % obs.players.length;
    if (obs.players[id].count > 0) return id;
  }
  return obs.me;
}

function candidates(obs) {
  const bids = obs.legalActions.filter(a => a.type === 'bid');
  const total = obs.players.reduce((n, p) => n + p.count, 0);
  const selected = new Map();
  for (let face = 1; face <= 6; face++) {
    const byFace = bids.filter(a => a.bid.face === face);
    const target = byFace.find(a => odds(obs.myDice, obs.players[obs.me].count, total, a.bid).covered <= .72);
    for (const a of [...byFace.slice(0, 2), ...(target ? byFace.filter(b => Math.abs(b.bid.qty - target.bid.qty) <= 1) : [])]) selected.set(actionKey(a), a);
  }
  for (const a of obs.legalActions.filter(a => a.type !== 'bid')) selected.set(actionKey(a), a);
  return [...selected.values()];
}

export function decide(obs, profiles = {}, seed = 'decision') {
  if (!obs.legalActions.length) throw new Error('No legal actions');
  const rng = random(seed);
  const style = PERSONALITIES[obs.players[obs.me].style] ?? PERSONALITIES.balanced;
  if (obs.phase === 'direction') {
    const direction = rng() < .5 ? 1 : -1;
    return { action: { type: 'direction', direction }, explanation: { rationale: 'Changing the order keeps the table interesting.', candidates: [] } };
  }
  const total = obs.players.reduce((n, p) => n + p.count, 0);
  const active = obs.players.filter(p => p.count > 0).length;
  const next = activeNext(obs);
  const nextStyle = PERSONALITIES[obs.players[next].style] ?? PERSONALITIES.balanced;
  const nextProfile = profileFor(profiles, next);
  const threshold = obs.players[next].kind === 'human' ? Math.max(.30, Math.min(.65, nextProfile.callProbability / nextProfile.calls + .06)) : nextStyle.call;
  const distributions = obs.players.map((p, id) => id === obs.me && obs.myDice
    ? [{ dice: obs.myDice, weight: 1 }] : posterior(obs, id, profiles));
  const sampleCount = obs.difficulty === 'sharp' ? 192 : obs.difficulty === 'relaxed' ? 64 : 112;
  const worlds = Array.from({ length: sampleCount }, () => distributions.map(dist => draw(dist, rng)));
  const loss = obs.shootout || obs.players[obs.me].count === 1 ? 1.65 : 1;
  const benefit = active === 2 ? loss : .55 / Math.sqrt(active - 1);
  const evaluated = candidates(obs).map(action => {
    let score = 0, covered = 0, exact = 0;
    for (const world of worlds) {
      const bid = action.type === 'bid' ? action.bid : obs.round.bid;
      const count = bid ? world.reduce((n, dice) => n + countFace(dice, bid.face), 0) : 0;
      const cov = bid ? count >= bid.qty : false;
      const ex = bid ? count === bid.qty : false;
      covered += Number(cov); exact += Number(ex);
      if (action.type === 'dudo') score += cov ? -loss : benefit;
      else if (action.type === 'calza') score += ex ? .85 : -loss;
      else if (action.type === 'tropicalLie') score += isTropical(world[obs.round.tropicalPending]) ? -loss : benefit;
      else if (action.type === 'tropical') {
        const challenge = obs.round.bid ? .45 : .28;
        score += isTropical(world[obs.me]) ? benefit * challenge + .025 : -loss * challenge + style.bluff * .25;
      } else if (action.type === 'bid') {
        const visibleToNext = obs.round.blind && obs.players[next].count >= 2 ? null : world[next];
        const perceived = odds(visibleToNext, obs.players[next].count, total, bid);
        let call = sigmoid((threshold - perceived.covered) * 11);
        // A human can still bluff/call outside the model. No deterministic oracle.
        call = .025 + .95 * call;
        const calza = obs.rules.calza && obs.players[next].count < 5 ? (1 - call) * sigmoid((perceived.exact - .42) * 15) * .6 : 0;
        const continueChance = 1 - call - calza;
        // Evaluate coverage and the response on the SAME sampled world.
        const immediate = call * (cov ? benefit : -loss) + calza * (ex ? -benefit * .8 : benefit);
        const pressure = 1 - perceived.covered;
        const continuation = .025 + .13 * pressure - (cov ? 0 : .20);
        score += immediate + continueChance * continuation;
      }
    }
    score /= sampleCount;
    if (action.type === 'dudo') score += (style.call - .47) * .65;
    if (action.type === 'bid') {
      const support = obs.myDice ? countFace(obs.myDice, action.bid.face) : 0;
      score += Math.min(2, support) * .012;
      score += style.bluff * .07 * (support === 0 ? 1 : 0);
      score += style.bluff * .12 * action.bid.qty / Math.max(1, total);
      score -= action.bid.qty / Math.max(1, total) * .015;
    }
    return { action, score, covered: covered / sampleCount, exact: exact / sampleCount };
  });
  evaluated.sort((a, b) => b.score - a.score);
  const temperature = style.temp * (obs.difficulty === 'relaxed' ? 2.0 : obs.difficulty === 'sharp' ? .6 : 1);
  const pool = evaluated.filter(e => e.score >= evaluated[0].score - (obs.difficulty === 'relaxed' ? .45 : .22));
  const weights = pool.map(e => Math.exp((e.score - pool[0].score) / temperature));
  let pick = rng() * weights.reduce((a, b) => a + b, 0), chosen = pool.at(-1);
  for (let i = 0; i < pool.length; i++) { pick -= weights[i]; if (pick <= 0) { chosen = pool[i]; break; } }
  const rationale = chosen.action.type === 'bid'
    ? 'A plausible raise with room for a bluff; weighing how the next player might respond.'
    : chosen.action.type === 'dudo' ? 'The bid looks stretched. Taking a chance on a challenge.'
    : chosen.action.type === 'calza' ? 'The exact count looks promising enough to risk a die.'
    : chosen.action.type === 'tropical' ? 'Using a Tropical declaration to put the next player on the spot.'
    : 'Weighing whether the Tropical declaration is believable.';
  return {
    action: chosen.action,
    explanation: { rationale, covered: chosen.covered, exact: chosen.exact, candidates: evaluated.slice(0, 4), samples: sampleCount },
  };
}

export function validateDecision(obs, result) {
  return Boolean(result?.action && obs.legalActions.some(a => actionKey(a) === actionKey(result.action)));
}
