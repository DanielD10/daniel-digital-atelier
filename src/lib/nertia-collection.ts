/**
 * Which cards this visitor has pulled. It lives in the browser only (a
 * per-viewer convenience for the set tracker), so every read and write
 * is wrapped: private windows and blocked storage just start empty.
 */

const KEY = "nertia:pulled";
const EVENT = "nertia:pulled";

/** kept in memory too, for when storage throws */
const memory = new Set<string>();

export function pulledCards(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set(memory);
  }
}

export function addPulled(ids: string[]) {
  const all = pulledCards();
  ids.forEach((id) => {
    all.add(id);
    memory.add(id);
  });
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...all]));
  } catch {
    // storage blocked: the in-memory copy still works for this visit
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onPulled(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
