import { VERSION, DEFAULT_RULES, newGame, applyAction, legalActions, observation, replay, totalDice, isTropical } from './engine.js';
import { PERSONALITIES, emptyProfiles, learn, validateDecision } from './ai.js';
import { hash } from './random.js';
import { calculateClaimOdds } from './odds.js';

const root = document.querySelector('#app');
const modal = document.querySelector('#modal');
const SAVE_KEY = 'its-a-lie:v1';
const COACH_KEY = 'its-a-lie:coach:v1';
const coach = { visible: false, enabled: true, minimumMatches: 1, weight: .2 };
let game = null, log = null, profiles = emptyProfiles(), notes = [], saved = null;
let generation = 0, busy = false, timeout = null, worker = null, workerRequest = 0;
let selectedFace = 2, selectedQty = 1, status = '', returnFocus = null;
let setup = { seats: 4, name: 'You', difficulty: 'social', rules: { ...DEFAULT_RULES } };

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value' || key === 'checked' || key === 'disabled') node[key] = value;
    else if (value !== false && value !== null) node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
const button = (text, action, cls = '', attrs = {}) => el('button', { type: 'button', class: cls, onclick: action, ...attrs }, text);
const pill = (text, cls = '') => el('span', { class: `pill ${cls}` }, text);
const pct = value => `${Math.round(value * 100)}%`;
function seed() {
  const values = crypto.getRandomValues(new Uint32Array(2));
  return Array.from(values, n => n.toString(36)).join('-');
}
function die(face, { hidden = false, small = false, match = false } = {}) {
  const node = el('span', { class: `die ${hidden ? 'hidden-die' : ''} ${small ? 'small' : ''} ${match ? 'matching' : ''} ${face === 1 && !hidden ? 'ace' : ''}`, role: 'img', 'aria-label': hidden ? 'Hidden die' : `${face === 1 ? 'Ace, wild' : face}` });
  if (hidden) { node.append(el('span', { class: 'hidden-mark', 'aria-hidden': 'true' }, '?')); return node; }
  const positions = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  for (let i = 1; i <= 9; i++) node.append(el('i', { class: positions[face]?.includes(i) ? 'pip on' : 'pip', 'aria-hidden': 'true' }));
  return node;
}
function header() {
  return el('header', { class: 'site-header' },
    el('a', { class: 'brand', href: './', onclick: event => { event.preventDefault(); if (game) showNewTable(); else render(); } }, el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '⁙'), "it's a lie", el('span', { class: 'brand-period' }, '.')),
    el('div', { class: 'header-right' }, el('span', { class: 'header-caption' }, 'A LITTLE LUCK. A LOT OF NERVE.'), button('How to play ↗', showRules, 'text-button')),
  );
}
function footer() {
  return el('footer', {}, el('span', {}, 'Made for the table. Played in your browser.'),
    el('div', {}, button('House rules', showRules, 'text-button'), ' · ', button('Import replay', importReplay, 'text-button'), ' · ', button('About & privacy', showAbout, 'text-button')));
}
function showDialog(title, body) {
  returnFocus = document.activeElement;
  modal.replaceChildren(el('div', { class: 'dialog-header' }, el('h2', { id: 'modal-title' }, title), button('×', () => modal.close(), 'close-button', { 'aria-label': 'Close dialog' })), body);
  if (!modal.open) modal.showModal();
}
modal.addEventListener('close', () => returnFocus?.isConnected && returnFocus.focus());
modal.addEventListener('click', e => { if (e.target === modal && (e.clientX < modal.getBoundingClientRect().left || e.clientX > modal.getBoundingClientRect().right || e.clientY < modal.getBoundingClientRect().top || e.clientY > modal.getBoundingClientRect().bottom)) modal.close(); });

function showRules() {
  const sections = [
    ['01 / Make a claim', 'Everyone starts with five hidden dice. Bid how many dice of one face exist across the whole table. Ones are wild for bids on 2–6; a bid on ones counts only ones. A bid means “at least this many.”'],
    ['02 / Raise or call', 'Raise the quantity, or keep the quantity and raise the face. Call “It’s a lie” if you think the bid is too high. Reveal: if the bid is covered, the caller loses a die; otherwise the bidder loses one. Lose your last die and you’re out.'],
    ['03 / Switching to aces', 'From q of a regular face, the minimum ace bid is floor(q ÷ 2) + 1. So 8 → 5 aces and 9 → 5 aces. From a aces, return to at least 2a of a regular face. You cannot open with aces by default. Bids cannot exceed the dice on the table.'],
    ['04 / Calza: exactly right', 'On your turn, with fewer than five dice, call Calza if the standing bid is exactly right. Correct: gain one die, up to five. Wrong: lose one. Either result ends the round. You cannot Calza a Tropical declaration.'],
    ['05 / Tropical', 'With five dice, once per player per round, declare Tropical: a claim that all five of your dice have different faces. You may bluff. This uses your turn without changing the standing bid. The next player must raise (or open), or challenge the declaration. A challenge reveals only the declarer’s dice. A true declaration costs the challenger a die; a false one costs the declarer. Either ends the round. An unchallenged declaration expires.'],
    ['06 / One blind round', 'The first time anyone drops to one die, the following round is blind for players with two or more dice. One-die players may see their die. This happens once per game. All dice still count normally.'],
    ['07 / The Shootout', 'When all remaining players begin a round with one die, each receives five. From then on, the loser of each round is eliminated outright; survivors keep five dice for the next Shootout round. Last player standing wins.'],
    ['08 / Who starts?', 'An opening roll determines the first starter; ties reroll. Each round, the starter chooses the direction (skipped with two players). The player who lost a die starts next; after elimination, the next surviving player in the previous direction starts. A successful Calza caller starts next.'],
  ];
  showDialog('The house rules', el('div', { class: 'rules-content' }, el('p', { class: 'lead' }, 'Perudo, with a few twists. These are our documented interpretations of the supplied Da Vinci house-rules plan.'),
    ...sections.map(([title, text]) => el('section', {}, el('h3', {}, title), el('p', {}, text))),
    el('p', { class: 'fine-print' }, 'Physical-table rules such as hygiene, heckling/comebacks, and host disputes are omitted. Optional rules can be switched off when setting up a table. The original Da Vinci rule sheet was not included in the handoff; this is an independent implementation.')));
}
function showAbout() {
  showDialog('At this table', el('div', { class: 'rules-content' },
    el('p', { class: 'lead' }, 'Smart company. Imperfect poker faces.'),
    el('p', {}, 'The opponents use probability estimates, short lookahead, individual temperaments, and light adaptation from the dice actually revealed. They bluff and make mistakes. They do not use a language model or claim game-theory-optimal play.'),
    el('h3', {}, 'Your browser is the whole table'),
    el('p', {}, 'No account, analytics, paid APIs, or application backend. Your current game is saved on this device when browser storage is available. GitHub, as the host, may keep standard access logs. Clearing browser storage removes the saved game.'),
    el('p', {}, 'This is casual single-player practice. A person inspecting browser memory or replay seeds can discover hidden dice. Exported replays include the dice seed. Do not use this app for trusted scores or stakes.'),
    el('p', {}, 'Bot explanations appear only after a full reveal. They describe estimates made with that bot’s own information, not a perfect assessment of your move.'),
    button('Clear saved game', () => { try { localStorage.removeItem(SAVE_KEY); } catch { /* storage can be disabled */ } saved = null; modal.close(); if (!game) render(); }, 'secondary'),
  ));
}

function setupView() {
  const choices = (key, values) => el('div', { class: 'segmented' }, values.map(([value, label]) => button(label, () => { setup[key] = value; render(); }, setup[key] === value ? 'selected' : '', { 'aria-pressed': setup[key] === value })));
  const names = ['Maya', 'Theo', 'Jules', 'Nico', 'Ada'];
  return el('main', { class: 'setup-page' },
    el('section', { class: 'intro' }, el('span', { class: 'eyebrow' }, el('span', { class: 'status-dot' }), 'PERUDO / DA VINCI HOUSE RULES'),
      el('h1', {}, 'The dice are hidden.', el('br'), el('em', {}, "The tells aren't.")),
      el('p', { class: 'intro-copy' }, 'A game of nerve, numbers, and knowing when to call it. Pull up a chair with opponents who have a style—and a bluff—of their own.'),
      el('div', { class: 'intro-tags' }, pill('2–6 at the table'), pill('No sign-up'), pill('Play at your pace'))),
    el('div', { class: 'setup-grid' },
      el('section', { class: 'table-preview', 'aria-label': 'Meet the opponents' },
        el('div', { class: 'preview-topline' }, el('span', {}, 'THE USUAL SUSPECTS'), el('span', {}, '01 — 05')),
        el('div', { class: 'hero-dice', 'aria-hidden': 'true' }, die(5), die(1), die(3)),
        el('div', { class: 'preview-inscription' }, 'Trust your gut.', el('br'), el('em', {}, 'Check the odds.')),
        el('div', { class: 'opponent-list' }, names.slice(0, setup.seats - 1).map((name, i) => {
          const style = Object.values(PERSONALITIES)[i];
          return el('div', { class: 'opponent-line' }, el('span', { class: `avatar tone-${i + 1}` }, name[0]), el('div', {}, el('strong', {}, name), el('span', {}, style.label)), el('span', { class: 'opponent-line-mark' }, '↗'));
        })),
        el('p', { class: 'preview-footnote' }, 'A different temperament in every seat. No two tables play quite alike.')),
      el('section', { class: 'setup-card' }, el('div', { class: 'card-heading' }, el('span', { class: 'eyebrow' }, 'YOUR NEXT GOOD BLUFF'), el('h2', {}, 'Set the table')),
        el('label', { class: 'field-label', for: 'player-name' }, 'Your name'),
        el('input', { id: 'player-name', maxlength: 24, value: setup.name, placeholder: 'You', autocomplete: 'nickname', oninput: e => { setup.name = e.target.value; } }),
        el('div', { class: 'field-group' }, el('span', { class: 'field-label', id: 'players-label' }, 'Players, including you'), choices('seats', [2, 3, 4, 5, 6].map(n => [n, String(n)]))),
        el('div', { class: 'field-group' }, el('span', { class: 'field-label' }, 'How’s the company?'), choices('difficulty', [['relaxed', 'Relaxed'], ['social', 'Switched on'], ['sharp', 'Sharp']]),
          el('p', { class: 'field-note' }, { relaxed: 'More hunches, more mistakes. A forgiving first table.', social: 'Thoughtful players with room for a calculated risk.', sharp: 'More careful decisions. Still human in spirit.' }[setup.difficulty])),
        el('details', { class: 'rule-settings' }, el('summary', {}, 'House-rule options', el('span', {}, '+')),
          el('div', { class: 'rule-toggles' }, [['tropical', 'Tropical declarations'], ['calza', 'Calza: exactly right'], ['blind', 'First one-die blind round'], ['shootout', 'Shootout finale'], ['openingAces', 'Allow opening with aces']].map(([key, label]) => el('label', {}, el('input', { type: 'checkbox', checked: setup.rules[key], onchange: e => { setup.rules[key] = e.target.checked; } }), label)))),
        button('Take your seat  ↗', () => startGame(), 'primary start-button'),
        saved && button('↶ Resume your saved table', resume, 'resume-button'),
        el('p', { class: 'setup-note' }, 'Five dice each. One last player standing.'))),
    el('section', { class: 'how-strip' }, [['01', 'Shake things up', 'Your dice are yours to know. Everyone’s dice count.'], ['02', 'Raise the stakes', 'Make a bigger claim—or challenge the last one.'], ['03', 'Call it', 'A good bluff only needs to be believed.']].map(([n, title, text]) => el('div', {}, el('span', {}, n), el('div', {}, el('h3', {}, title), el('p', {}, text))))),
  );
}

function startGame(config = null) {
  cancelThinking();
  const actual = config ?? { ...setup, rules: { ...setup.rules }, seed: seed() };
  game = newGame(actual);
  log = { version: VERSION, config: actual, policySeed: seed(), actions: [] };
  profiles = emptyProfiles(); notes = []; status = '';
  resetBid(); persist(); render(); scheduleBot();
}
function cancelThinking() {
  generation++; clearTimeout(timeout); worker?.terminate(); worker = null; busy = false;
}
function reconstruct(candidate) {
  // Replay validation is the authority; never trust a saved raw GameState.
  const verified = replay(candidate);
  let state = newGame(candidate.config), nextProfiles = emptyProfiles();
  for (const record of candidate.actions) {
    state = applyAction(state, record.actor, record.action);
    if (['reveal', 'gameOver'].includes(state.phase) && record.action.type !== 'next') nextProfiles = learn(nextProfiles, state.reveal);
  }
  return { state: verified, profiles: nextProfiles };
}
function resume() {
  try {
    const reconstructed = reconstruct(saved);
    cancelThinking(); game = reconstructed.state; profiles = reconstructed.profiles;
    log = saved; notes = []; status = 'Saved table restored.'; resetBid(); render(); scheduleBot();
  } catch { saved = null; status = 'That saved game could not be restored. Start a new table.'; render(); }
}
function persist() {
  saved = log;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(log)); }
  catch { status = 'Browser storage is unavailable. Export a replay to keep this game.'; }
}
function resetBid() {
  if (!game) return;
  const first = legalActions(game, 0).find(a => a.type === 'bid');
  if (first) { selectedQty = first.bid.qty; selectedFace = first.bid.face; }
}
function act(actor, action, explanation = null) {
  try {
    game = applyAction(game, actor, action);
    log.actions.push({ actor, action });
    if (explanation && action.type !== 'direction') notes.push({ actor, round: game.round.number, action, explanation });
    status = '';
    if (game.phase === 'reveal' || game.phase === 'gameOver') profiles = learn(profiles, game.reveal);
    resetBid(); persist(); render(); scheduleBot();
  } catch (error) { status = error.message; busy = false; render(); }
}

function scheduleBot() {
  if (!game || !['direction', 'bidding'].includes(game.phase) || game.players[game.round.turn].kind !== 'bot' || busy) return;
  busy = true;
  const token = generation, actor = game.round.turn, actionCount = log.actions.length;
  render();
  timeout = setTimeout(() => runBot(token, actor, actionCount), 650 + (hash(`${log.policySeed}:${actionCount}`) % 550));
}
function runBot(token, actor, actionCount) {
  const obs = observation(game, actor), id = ++workerRequest;
  let settled = false;
  const finish = result => {
    if (settled || token !== generation || actionCount !== log.actions.length) return;
    settled = true; clearTimeout(timeout); busy = false;
    if (!validateDecision(obs, result)) {
      const fallback = obs.legalActions.find(a => a.type === 'dudo' || a.type === 'tropicalLie') ?? obs.legalActions[0];
      status = 'A bot recovered from a thinking error.';
      act(actor, fallback);
    } else act(actor, result.action, result.explanation);
  };
  try {
    worker ??= new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { if (data.id === id) finish(data.result); };
    worker.onerror = () => { worker?.terminate(); worker = null; finish(null); };
    timeout = setTimeout(() => { worker?.terminate(); worker = null; finish(null); }, 6000);
    worker.postMessage({ id, observation: obs, profiles, seed: hash(`${log.policySeed}:${actor}:${actionCount}`) });
  } catch { finish(null); }
}

function actionText(action) {
  if (action.type === 'bid') return `${action.bid.qty} × ${action.bid.face === 1 ? 'aces' : action.bid.face + 's'}`;
  return { dudo: '“It’s a lie!”', calza: 'Calza!', tropical: 'Tropical', tropicalLie: 'Challenges Tropical', direction: action.direction === 1 ? 'Clockwise ↻' : 'Anticlockwise ↺', next: 'Next round' }[action.type] ?? action.type;
}

function playerSeat(player, seatIndex, count) {
  const isTurn = ['direction', 'bidding'].includes(game.phase) && player.id === game.round.turn;
  const out = player.count === 0;
  const positions = { 2: [[50, 87], [50, 12]], 3: [[50, 87], [20, 18], [80, 18]], 4: [[50, 87], [12, 49], [50, 10], [88, 49]], 5: [[50, 88], [10, 61], [25, 12], [75, 12], [90, 61]], 6: [[50, 88], [10, 68], [10, 24], [50, 9], [90, 24], [90, 68]] };
  const [x, y] = positions[count][seatIndex];
  return el('div', { class: `seat ${isTurn ? 'current-seat' : ''} ${out ? 'out-seat' : ''} ${player.id === 0 ? 'human-seat' : ''}`, style: `--x:${x}%;--y:${y}%` },
    el('span', { class: `avatar tone-${player.id}`, 'aria-hidden': 'true' }, player.name[0].toUpperCase()),
    el('strong', {}, player.name, player.id === 0 ? ' (you)' : ''),
    el('span', { class: 'seat-description' }, out ? 'Out this game' : player.id === 0 ? 'Trust your instincts' : PERSONALITIES[player.style].label),
    el('div', { class: 'seat-dice', 'aria-label': `${player.count} dice remaining` }, Array.from({ length: player.count }, () => die(1, { hidden: true, small: true }))),
    isTurn && el('span', { class: 'turn-tag' }, busy ? 'Thinking…' : 'Your turn'),
  );
}
function tableView() {
  const r = game.round;
  const lastTropical = r.tropicalPending !== null;
  return el('section', { class: 'table-area', 'aria-label': 'Game table' },
    el('div', { class: 'table-felt' }, el('div', { class: 'table-inner-border' })),
    ...game.players.map((p, i) => playerSeat(p, i, game.players.length)),
    el('div', { class: 'standing-bid' }, el('span', { class: 'eyebrow' }, game.phase === 'direction' ? 'A CHANGE OF PACE?' : lastTropical ? 'TROPICAL DECLARED' : r.bid ? 'THE STANDING BID' : 'THE TABLE IS OPEN'),
      game.phase === 'direction' ? el('div', { class: 'bid-empty' }, 'Which way?')
        : lastTropical ? el('div', { class: 'bid-empty' }, 'Five. All different.')
        : r.bid ? el('div', { class: 'bid-display' }, el('span', { class: 'bid-number' }, r.bid.qty), el('span', { class: 'times' }, '×'), die(r.bid.face))
        : el('div', { class: 'bid-empty' }, 'Make the first move.'),
      el('p', {}, lastTropical ? `${game.players[r.tropicalPending].name} is claiming a Tropical.` : r.bid ? `${game.players[r.bidder].name} made the call` : game.phase === 'direction' ? `${game.players[r.starter].name} chooses the direction` : `${game.players[r.turn].name} opens this round`),
      lastTropical && r.bid && el('span', { class: 'standing-previous' }, `Standing bid stays ${actionText({ type: 'bid', bid: r.bid })}`),
      el('span', { class: 'table-direction' }, `${r.direction === 1 ? '↻' : '↺'} ${r.direction === 1 ? 'CLOCKWISE' : 'ANTICLOCKWISE'}`)),
  );
}

function handView() {
  const human = game.players[0], blind = game.round.blind && human.count >= 2;
  if (human.count === 0) return el('section', { class: 'your-hand' }, el('div', {}, el('span', { class: 'eyebrow' }, 'YOUR CUP IS EMPTY'), el('h3', {}, 'Stay for the finish.')), el('p', {}, 'Watch the remaining players battle it out.'));
  return el('section', { class: 'your-hand' }, el('div', {}, el('span', { class: 'eyebrow' }, 'YOUR HAND'), el('h3', {}, blind ? 'A little faith required.' : 'For your eyes only.'), el('span', { class: 'field-note' }, blind ? 'You cannot see your dice this round.' : 'Aces are wild for bids on 2–6.')),
    el('div', { class: 'hand-dice' }, human.dice.map(d => die(d, { hidden: blind }))),
    !blind && game.rules.tropical && isTropical(human.dice) && pill('A true Tropical', 'green-pill'));
}

function controls() {
  const actions = legalActions(game, 0);
  const available = type => actions.some(a => a.type === type);
  const myTurn = !busy && game.round.turn === 0 && game.players[0].count > 0;
  if (game.phase === 'direction') return el('section', { class: 'action-panel' },
    el('h3', {}, myTurn ? 'Your table. Your direction.' : `${game.players[game.round.turn].name} is choosing the direction…`),
    myTurn && el('div', { class: 'direction-actions' }, button('↻ Clockwise', () => act(0, { type: 'direction', direction: 1 }), 'primary'), button('↺ Anticlockwise', () => act(0, { type: 'direction', direction: -1 }), 'secondary')));
  if (!myTurn) return el('section', { class: 'action-panel waiting-panel', 'aria-live': 'polite' }, el('span', { class: 'thinking-dots', 'aria-hidden': 'true' }, '•••'), el('div', {}, el('h3', {}, `${game.players[game.round.turn].name} is sizing up the table.`), el('p', {}, 'Good company takes a moment to think.')));
  const raises = actions.filter(a => a.type === 'bid');
  const legalQuantities = raises.filter(a => a.bid.face === selectedFace).map(a => a.bid.qty);
  const selected = raises.find(a => a.bid.qty === selectedQty && a.bid.face === selectedFace);
  const faceChange = face => {
    selectedFace = face;
    const qs = raises.filter(a => a.bid.face === face).map(a => a.bid.qty);
    if (!qs.includes(selectedQty)) selectedQty = qs[0];
    updateControls('face-' + face);
  };
  const changeQty = delta => {
    const index = legalQuantities.indexOf(selectedQty);
    selectedQty = legalQuantities[Math.max(0, Math.min(legalQuantities.length - 1, index + delta))];
    updateControls(delta > 0 ? 'qty-up' : 'qty-down');
  };
  return el('section', { class: 'action-panel' },
    el('div', { class: 'action-heading' }, el('h3', {}, game.round.tropicalPending !== null ? 'Raise, or challenge the Tropical.' : 'Your move. Make it count.'), pill('YOUR TURN', 'orange-pill')),
    raises.length > 0 && el('div', { class: 'bid-builder' },
      el('div', { class: 'quantity-section' }, el('span', { class: 'field-label' }, 'How many?'), el('div', { class: 'stepper' }, button('−', () => changeQty(-1), '', { id: 'qty-down', 'aria-label': 'Decrease quantity', disabled: selectedQty === legalQuantities[0] }), el('output', { 'aria-live': 'polite' }, selectedQty), button('+', () => changeQty(1), '', { id: 'qty-up', 'aria-label': 'Increase quantity', disabled: selectedQty === legalQuantities.at(-1) }))),
      el('div', { class: 'face-section' }, el('span', { class: 'field-label' }, 'Of which face?'), el('div', { class: 'face-picker' }, [1, 2, 3, 4, 5, 6].map(face => el('button', { id: `face-${face}`, type: 'button', class: selectedFace === face ? 'selected' : '', disabled: !raises.some(a => a.bid.face === face), onclick: () => faceChange(face), 'aria-label': face === 1 ? 'Bid aces' : `Bid ${face}s`, 'aria-pressed': selectedFace === face }, die(face))))),
      button(`Bid ${selectedQty} × ${selectedFace === 1 ? 'aces' : selectedFace + 's'}  ↗`, () => selected && act(0, selected), 'primary bid-submit', { disabled: !selected })),
    el('div', { class: 'challenge-actions' },
      available('dudo') && button('It’s a lie!', () => act(0, { type: 'dudo' }), 'challenge-button', { title: 'Challenge: the bid is too high' }),
      available('calza') && button('Calza · exactly right', () => act(0, { type: 'calza' }), 'secondary', { title: 'Gain one die if exact; lose one otherwise' }),
      available('tropical') && button('Declare Tropical', () => act(0, { type: 'tropical' }), 'secondary', { title: 'Claim five different faces. You may bluff.' }),
      available('tropicalLie') && button('Challenge Tropical', () => act(0, { type: 'tropicalLie' }), 'challenge-button')),
    el('p', { class: 'field-note action-hint' }, game.round.tropicalPending !== null ? 'Only the Tropical can be challenged. The previous bid stays in place.' : 'Switching to aces: halve the quantity, round down, add 1. Back from aces: double.'),
  );
}
function updateControls(focusId) {
  document.querySelector('#controls').replaceChildren(controls());
  updateCoachResults();
  document.getElementById(focusId)?.focus();
}

const oddsPercent = value => `${(value * 100).toFixed(1)}%`;
function saveCoach() {
  try { localStorage.setItem(COACH_KEY, JSON.stringify(coach)); } catch { /* Optional preference storage. */ }
}
function toggleCoach() {
  coach.visible = !coach.visible;
  saveCoach();
  render();
  document.querySelector('#toggle-odds')?.focus();
}
function updateCoachResults() {
  const destination = document.querySelector('#odds-results');
  if (destination) {
    const mathOpen = destination.querySelector('.odds-math')?.open;
    destination.replaceChildren(coachResults());
    if (mathOpen) destination.querySelector('.odds-math')?.setAttribute('open', '');
  }
}
function coachResults() {
  if (game.phase !== 'bidding') return el('p', { class: 'field-note' }, game.phase === 'direction'
    ? 'Calculations appear when bidding begins.' : 'The round is finished. Live odds return with the next roll.');
  // Use precisely the human's legitimate view, including null dice when blind.
  const obs = observation(game, 0);
  const bid = obs.round.bid;
  const calculation = bid ? calculateClaimOdds(obs, bid, coach) : null;
  const preview = obs.legalActions.find(a => a.type === 'bid' && a.bid.qty === selectedQty && a.bid.face === selectedFace);
  const draft = preview ? calculateClaimOdds(obs, preview.bid, coach) : null;
  const stats = calculation && el('table', { class: 'odds-table', 'aria-label': 'Standing bid probabilities' },
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Chance'), el('th', { scope: 'col' }, 'Dice only'), coach.enabled && el('th', { scope: 'col' }, 'Soft view'))),
    el('tbody', {}, [['Claim true', 'covered'], ['Dudo succeeds', 'dudo'], ['Exactly right', 'exact']].map(([label, key]) => el('tr', {},
      el('th', { scope: 'row' }, label), el('td', { 'data-raw': key }, oddsPercent(calculation.raw[key])),
      coach.enabled && el('td', { 'data-soft': key }, oddsPercent(calculation.adjusted[key]))))));
  const assumption = calculation?.assumption ?? draft?.assumption;
  const supportFace = assumption?.face === 1 ? 'aces' : assumption?.face ? `${assumption.face}s or wild aces` : '';
  const math = calculation?.math ?? draft?.math;
  return el('div', {},
    bid ? el('section', { class: 'odds-subject' }, el('span', { class: 'eyebrow' }, 'STANDING BID'),
      el('h3', {}, actionText({ type: 'bid', bid })), el('p', { class: 'field-note' }, `By ${obs.players[obs.round.bidder].name} · from your viewpoint`), stats,
      obs.round.tropicalPending !== null && el('p', { class: 'odds-availability' }, 'Tropical is pending: Dudo and Calza on this bid are unavailable. Challenge the declaration or raise.'),
      obs.round.tropicalPending === null && !obs.legalActions.some(a => a.type === 'dudo') && el('p', { class: 'odds-availability' }, 'Dudo is available only on your turn, against another player’s bid.'),
      !obs.legalActions.some(a => a.type === 'calza') && el('p', { class: 'field-note' }, '“Exactly right” is a probability, not a Calza recommendation. Calza is unavailable now.'))
      : el('p', { class: 'field-note' }, obs.round.tropicalPending !== null ? 'A Tropical declaration has no ordinary bid odds. Its truth depends on the declarer’s behaviour; the random-hand rate of 9.26% is not its truth probability.' : 'No standing bid yet. Try a draft in your bid picker.'),
    draft && el('section', { class: 'odds-draft' }, el('span', { class: 'eyebrow' }, 'YOUR DRAFT'),
      el('h3', { id: 'odds-draft-label' }, actionText(preview)),
      el('div', { class: 'odds-draft-values' }, el('span', {}, 'Claim true'), el('strong', { 'data-draft-raw': 'covered' }, oddsPercent(draft.raw.covered)),
        coach.enabled && el('span', { class: 'field-note', 'data-draft-soft': 'covered' }, `Soft view ${oddsPercent(draft.adjusted.covered)}`)),
      el('p', { class: 'field-note' }, 'Uses your hand. The next player has different information.')),
    assumption && coach.enabled && el('div', { class: 'odds-assumption' },
      assumption.applied ? [
        el('p', {}, `Assume ${obs.players[assumption.bidder].name} has at least ${assumption.minimumMatches} matching ${assumption.minimumMatches === 1 ? 'die' : 'dice'} for their ${supportFace} bid.`),
        el('p', { class: 'field-note' }, `Soft view = ${Math.round((1 - coach.weight) * 100)}% dice-only + ${Math.round(coach.weight * 100)}% support scenario. This is a what-if estimate, not a measured truth probability or guaranteed bound.`),
        draft && bid && draft.assumption.face !== preview.bid.face && el('p', { class: 'field-note' }, `Your draft still assumes support for the bidder’s ${supportFace}, not for your new face.`),
      ] : el('p', { class: 'field-note' }, assumption.reason)),
    math && el('details', { class: 'odds-math' }, el('summary', {}, 'Show the calculation'),
      el('p', { class: 'field-note' }, `${math.total} total − ${math.visible} visible = ${math.unknown} unknown dice.`),
      el('p', { class: 'field-note' }, `${math.known} matching dice in your hand${obs.myDice === null ? ' (your cup is blind, so none are known)' : ''}. ${math.p === 1 / 6 ? 'Each unknown die matches an ace bid with probability 1/6.' : 'Each unknown die matches the face or an ace with probability 1/3.'}`),
      el('p', { class: 'odds-formula' }, `X ∼ Binomial(${math.unknown}, ${math.p === 1 / 6 ? '1/6' : '1/3'})`),
      el('p', { class: 'field-note' }, `Claim true: P(X ≥ ${math.needed}). Exactly right: P(X = ${math.needed}). Dudo: 1 − P(claim true).`),
      el('p', { class: 'field-note' }, `Dice-only expected total: ${(calculation?.raw ?? draft.raw).expected.toFixed(2)}. An average is not a safe guarantee.`),
      assumption?.applied && calculation && el('p', { class: 'field-note' }, `If the support scenario were certain: claim true ${oddsPercent(calculation.supported.covered)}, Dudo ${oddsPercent(calculation.supported.dudo)}. We condition the bidder’s actual cup size, leaving all other unknown dice random.`),
      el('p', { class: 'field-note' }, 'For a different draft face, the support model counts the joint face possibilities in the bidder’s cup. It does not add imaginary dice. Other bids and player-specific bluff rates are not modelled here.')),
    el('p', { class: 'odds-footnote' }, 'More matching dice make a claim more believable and Dudo less likely to succeed. No opponent dice are read.'));
}
function coachPanel() {
  function changeSetting(key, value) {
    coach[key] = value; saveCoach();
    document.querySelector('#support-matches').disabled = !coach.enabled;
    document.querySelector('#support-weight').disabled = !coach.enabled;
    document.querySelector('#support-weight-value').textContent = `${Math.round(coach.weight * 100)}%`;
    updateCoachResults();
  }
  return el('aside', { class: 'odds-panel', id: 'odds-coach', 'aria-label': 'Live odds coach' },
    el('div', { class: 'odds-heading' }, el('span', { class: 'eyebrow' }, 'AT A GLANCE'), el('h2', {}, 'Know the odds.')),
    el('label', { class: 'odds-toggle' }, el('input', { id: 'support-toggle', type: 'checkbox', checked: coach.enabled, onchange: e => changeSetting('enabled', e.target.checked) }), 'Soft bidder-support assumption'),
    el('div', { class: 'odds-settings' },
      el('label', { for: 'support-matches' }, 'Bidder holds at least',
        el('select', { id: 'support-matches', disabled: !coach.enabled, onchange: e => changeSetting('minimumMatches', Number(e.target.value)) },
          [1, 2].map(value => el('option', { value, selected: coach.minimumMatches === value }, `${value} matching ${value === 1 ? 'die' : 'dice'}`)))),
      el('label', { for: 'support-weight' }, 'Assumption weight ', el('output', { id: 'support-weight-value', for: 'support-weight' }, `${Math.round(coach.weight * 100)}%`),
        el('input', { id: 'support-weight', type: 'range', min: 0, max: 100, step: 5, value: Math.round(coach.weight * 100), disabled: !coach.enabled, oninput: e => changeSetting('weight', Number(e.target.value) / 100) }))),
    el('div', { id: 'odds-results', 'aria-live': 'polite' }, coachResults()));
}

function revealView() {
  const reveal = game.reveal;
  const actor = game.players[reveal.actor].name;
  let title, subtitle;
  if (reveal.type === 'dudo') {
    title = reveal.correct ? 'A bluff, called.' : 'The dice back it up.';
    subtitle = `${reveal.count} matching dice. The bid was ${reveal.bid.qty}. ${game.players[reveal.loser].name} ${reveal.shootout ? 'is eliminated' : 'loses a die'}.`;
  } else if (reveal.type === 'calza') {
    title = reveal.correct ? 'Right on the number.' : 'Close doesn’t count.';
    subtitle = `${reveal.count} matching dice. ${actor} ${reveal.correct ? 'gains a die' : reveal.shootout ? 'is eliminated' : 'loses a die'}.`;
  } else {
    title = reveal.correct ? 'Not so Tropical.' : 'Five different faces.';
    subtitle = `${game.players[reveal.declarer].name} ${reveal.correct ? 'was bluffing' : 'had a true Tropical'}. ${game.players[reveal.loser].name} ${reveal.shootout ? 'is eliminated' : 'loses a die'}.`;
  }
  const fullReveal = reveal.hands.every((hand, id) => hand !== null || reveal.countsBefore[id] === 0);
  const roundNotes = notes.filter(n => n.round === reveal.round);
  return el('section', { class: 'reveal-panel', 'aria-label': 'Round result' },
    el('span', { class: 'eyebrow' }, game.phase === 'gameOver' ? 'LAST PLAYER STANDING' : `ROUND ${reveal.round} / THE REVEAL`),
    el('h2', { tabindex: -1, id: 'result-heading' }, game.phase === 'gameOver' ? `${game.winner === 0 ? 'You take' : game.players[game.winner].name + ' takes'} the table.` : title),
    el('p', { class: 'reveal-subtitle' }, subtitle),
    el('div', { class: 'reveal-hands' }, reveal.hands.map((hand, id) => reveal.countsBefore[id] > 0 && el('div', { class: `reveal-player ${reveal.loser === id ? 'lost-die' : ''}` },
      el('div', { class: 'reveal-player-heading' }, el('strong', {}, game.players[id].name), reveal.loser === id && pill(reveal.shootout || game.players[id].count === 0 ? 'OUT' : '−1 DIE', 'orange-pill'), reveal.gainer === id && pill('+1 DIE', 'green-pill')),
      el('div', { class: 'revealed-dice-row' }, hand ? hand.map(d => die(d, { small: true, match: reveal.type !== 'tropicalLie' && (d === reveal.bid.face || (reveal.bid.face !== 1 && d === 1)) })) : Array.from({ length: reveal.countsBefore[id] }, () => die(1, { small: true, hidden: true }))),
      !hand && el('span', { class: 'field-note' }, 'Cup stays private')))),
    game.phase === 'gameOver' ? el('div', { class: 'result-actions' }, button('Another round of company ↗', () => startGame(), 'primary'), button('Set up a new table', showNewTable, 'secondary'))
      : el('div', { class: 'result-actions' }, button(`Next round · ${game.players[reveal.nextStarter].name} starts  ↗`, () => act(0, { type: 'next' }), 'primary'), reveal.blindNext && pill('BLIND ROUND NEXT', 'orange-pill'), game.shootoutActive && pill('SHOOTOUT CONTINUES', 'orange-pill')),
    fullReveal && roundNotes.length > 0 && el('details', { class: 'round-analysis' }, el('summary', {}, 'Behind the bluff · bot decision notes'),
      el('p', { class: 'field-note' }, 'Estimates from each bot’s viewpoint when it moved. Coverage is for its chosen bid, or the bid it challenged. These are noisy model estimates, not perfect play or move grades.'),
      ...roundNotes.map(n => el('div', { class: 'analysis-item' }, el('strong', {}, `${game.players[n.actor].name} · ${actionText(n.action)}`), el('p', {}, n.explanation.rationale),
        n.action.type !== 'tropical' && n.action.type !== 'tropicalLie' && el('span', { class: 'analysis-odds' }, `Estimated coverage ${pct(n.explanation.covered)} · exact ${pct(n.explanation.exact)}`)))),
    !fullReveal && el('p', { class: 'field-note' }, 'Only the Tropical declarer’s cup is revealed. Private bot analysis stays hidden.'),
  );
}

function historyView() {
  const history = game.round.history.filter(r => r.action.type !== 'direction');
  return el('aside', { class: 'history-panel' }, el('div', { class: 'history-header' }, el('span', { class: 'eyebrow' }, 'TABLE TALK'), el('span', { class: 'field-note' }, `Round ${game.round.number}`)),
    el('div', { class: 'history-list' }, history.length ? [...history].reverse().map(({ player, action }, i) => el('div', { class: `history-item ${i === 0 ? 'latest' : ''}` }, el('span', { class: `mini-avatar tone-${player}` }, game.players[player].name[0].toUpperCase()), el('div', {}, el('strong', {}, game.players[player].name), el('span', {}, actionText(action))))) : el('p', { class: 'empty-history' }, 'A clean slate. Someone has to go first.')),
    el('div', { class: 'table-notes' }, el('h3', {}, 'A little reminder'), el('p', {}, game.round.tropicalPending !== null ? 'A Tropical declaration is a claim about one cup. Challenge it, or make the next bid.' : 'The bid is for the whole table, including your dice. Ones count as wild for every face except an ace bid.')),
    el('div', { class: 'host-note' }, `Opening roll: ${game.players[game.host].name} won${game.hostRolls.length > 1 ? ' after a tie-break' : ''}.`));
}

function gameView() {
  const result = game.phase === 'reveal' || game.phase === 'gameOver';
  return el('main', { class: 'game-page' },
    el('div', { class: 'game-title-row' }, el('div', {}, el('span', { class: 'eyebrow' }, 'THE TABLE IS YOURS'), el('h1', {}, 'Keep a straight face.')),
      el('div', { class: 'game-tools' }, button(coach.visible ? 'Hide odds' : 'Show odds', toggleCoach, 'secondary', { id: 'toggle-odds', 'aria-pressed': coach.visible, 'aria-controls': 'odds-coach' }), button('Export replay ↓', exportReplay, 'text-button'), button('New table', showNewTable, 'secondary'))),
    el('div', { class: 'game-meta', 'aria-live': 'polite' }, pill(`ROUND ${game.round.number}`), pill(`${totalDice(game)} DICE IN PLAY`), game.round.blind && pill('BLIND ROUND', 'orange-pill'), game.shootoutActive && pill('SHOOTOUT · LOSS = OUT', 'orange-pill'), el('span', {}, game.phase === 'gameOver' ? 'A good game. A better rematch?' : result ? 'The cups are up.' : `${game.players[game.round.turn].name}${game.round.turn === 0 ? ', it’s your move.' : ' has the floor.'}`)),
    el('div', { class: `play-layout ${coach.visible ? 'odds-visible' : ''}` }, el('div', { class: 'play-main' }, result ? revealView() : [tableView(), handView(), el('div', { id: 'controls' }, controls())]),
      el('div', { class: 'play-sidebar' }, coach.visible && coachPanel(), historyView())),
  );
}
function showNewTable() {
  if (!game) return;
  showDialog('A fresh table?', el('div', { class: 'rules-content' }, el('p', {}, 'Your current game stays saved until you start the next one. You can also export it as a replay.'), el('div', { class: 'result-actions' },
    button('Set up a new table', () => { cancelThinking(); game = null; status = ''; modal.close(); render(); }, 'primary'), button('Keep playing', () => modal.close(), 'secondary'))));
}
function download(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = el('a', { href: url, download: filename }); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportReplay() { if (log) download(log, `its-a-lie-round-${game.round.number}.json`); }
function importReplay() {
  const input = el('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    try {
      const file = input.files[0]; if (!file) return;
      if (file.size > 5_000_000) throw new Error('Replay is too large (maximum 5 MB).');
      const candidate = JSON.parse(await file.text());
      const reconstructed = reconstruct(candidate);
      cancelThinking(); game = reconstructed.state; log = { ...candidate, policySeed: typeof candidate.policySeed === 'string' ? candidate.policySeed.slice(0, 200) : seed() };
      profiles = reconstructed.profiles; notes = []; status = 'Replay loaded. You can continue from here.';
      modal.close(); resetBid(); persist(); render(); scheduleBot();
    } catch (error) { showDialog('Could not load replay', el('p', {}, error.message)); }
  });
  input.click();
}
function render() {
  root.replaceChildren(header(), game ? gameView() : setupView(), status && el('p', { class: 'status-message', role: 'status' }, status), footer());
  document.title = game ? `Round ${game.round.number} — It's a Lie` : "It's a Lie — Pull up a chair";
}
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw && raw.length <= 5_000_000) saved = JSON.parse(raw);
  const preferences = JSON.parse(localStorage.getItem(COACH_KEY) ?? 'null');
  if (preferences && typeof preferences.visible === 'boolean') {
    coach.visible = preferences.visible;
    if (typeof preferences.enabled === 'boolean') coach.enabled = preferences.enabled;
    if ([1, 2].includes(preferences.minimumMatches)) coach.minimumMatches = preferences.minimumMatches;
    if (typeof preferences.weight === 'number' && Number.isFinite(preferences.weight) && preferences.weight >= 0 && preferences.weight <= 1) coach.weight = preferences.weight;
  }
} catch { /* First visit or unavailable storage. */ }
render();
