import { SPACE_FACTS } from '../data/spaceFacts.js';
const KEY = 'lastFact';

export function pickFact(storage = localStorage) {
  let last = -1;
  try { last = +(storage.getItem(KEY) || -1); } catch {}
  let i;
  do { i = Math.floor(Math.random() * SPACE_FACTS.length); } while (i === last && SPACE_FACTS.length > 1);
  try { storage.setItem(KEY, String(i)); } catch {}
  return SPACE_FACTS[i];
}

export function renderFact(el, storage = localStorage) {
  el.textContent = pickFact(storage);
}
