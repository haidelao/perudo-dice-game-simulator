// Deterministic dice and decision streams are deliberately separate.
export function hash(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function nextUint(state) {
  const next = (state + 0x6D2B79F5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0), next];
}

export function random(seed) {
  let state = typeof seed === 'number' ? seed >>> 0 : hash(seed);
  return () => {
    const [value, next] = nextUint(state);
    state = next;
    return value / 4294967296;
  };
}

export function roll(state, count) {
  const dice = [];
  while (dice.length < count) {
    const [value, next] = nextUint(state);
    state = next;
    // Reject the remainder rather than biasing six faces via modulo.
    if (value < 4294967292) dice.push(value % 6 + 1);
  }
  return { dice, state };
}
