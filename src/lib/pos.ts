import posDict from '@/data/pos-dict.json';

export type PosKey = 'n' | 'v' | 'adj' | 'adv' | 'prep' | 'conj' | 'phrase' | 'other';

export const POS_LIST: [PosKey, string][] = [
  ['n', 'Danh từ'],
  ['v', 'Động từ'],
  ['adj', 'Tính từ'],
  ['adv', 'Trạng từ'],
  ['prep', 'Giới từ'],
  ['conj', 'Liên từ'],
  ['phrase', 'Cụm từ'],
  ['other', 'Khác'],
];

export const POS_SHORT: Record<PosKey, string> = {
  n: 'n.',
  v: 'v.',
  adj: 'adj.',
  adv: 'adv.',
  prep: 'prep.',
  conj: 'conj.',
  phrase: 'cụm từ',
  other: '?',
};

const POS_ALIAS: Record<string, PosKey> = {
  n: 'n',
  noun: 'n',
  v: 'v',
  verb: 'v',
  adj: 'adj',
  a: 'adj',
  adjective: 'adj',
  adv: 'adv',
  adverb: 'adv',
  prep: 'prep',
  preposition: 'prep',
  conj: 'conj',
  conjunction: 'conj',
  phrase: 'phrase',
  pron: 'other',
  det: 'other',
  interj: 'other',
  other: 'other',
};

const POS_FIX = posDict.POS_FIX as Record<string, PosKey[]>;
const BUILTIN_POS = posDict.BUILTIN_POS as Record<string, PosKey[]>;
const DEFAULT_POS = posDict.DEFAULT_POS as Record<string, PosKey[]>;

const LY_ADJ =
  /^(unlikely|likely|friendly|lovely|costly|timely|orderly|elderly|daily|weekly|monthly|yearly|early|only|family|supply|apply|reply|rely|assembly|ally|holy|ugly|lively|deadly|silly|lonely)$/;
const PHRASAL_PARTICLE =
  /^(up|off|out|on|in|back|down|over|through|under|into|away|around|apart|along|aside)$/;
const NOT_VERB_START = /^(in|on|at|as|by|for|of|if|so|to|owing|best|even|up)$/;

export function keyOf(w: string | undefined | null): string {
  return String(w || '').trim().toLowerCase();
}

export function capFirst(s: string | undefined | null): string {
  const str = String(s || '');
  if (!str) return str;
  return str.charAt(0).toLocaleUpperCase('vi') + str.slice(1);
}

function parsePosTags(s?: string): PosKey[] {
  return String(s || '')
    .toLowerCase()
    .split(/[,;/\s.]+/)
    .map((x) => POS_ALIAS[x])
    .filter((x): x is PosKey => Boolean(x));
}

function guessSingle(w: string, meaning: string): PosKey[] {
  const k = keyOf(w);
  const m = keyOf(meaning);
  if (/ly$/.test(k) && !LY_ADJ.test(k)) return ['adv'];
  if (/(tion|sion|ment|ness|ity|ship|ance|ence|ism|ist|hood|age|ure|ery|ics)s?$/.test(k)) return ['n'];
  if (/(ous|ive|ful|less|able|ible|ical|ary|ory|ent|ant|al|ic)$/.test(k)) return ['adj'];
  if (/(ize|ise|ify|ate)$/.test(k)) return ['v'];
  if (/(ing|ed)$/.test(k)) return ['v', 'adj'];
  if (/^(sự|việc|người|nhà|cái|bộ|máy|tiền|phí|chi phí|hệ thống)\s/.test(m)) return ['n'];
  if (/^\(?thuộc/.test(m)) return ['adj'];
  return ['other'];
}

function posOfWord(a: string, meaning: string): PosKey[] {
  const k = keyOf(a);
  return POS_FIX[k] || DEFAULT_POS[k] || BUILTIN_POS[k] || guessSingle(k, meaning);
}

function posOfPhrase(a: string, meaning: string): PosKey[] {
  const parts = keyOf(a).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return posOfWord(a, meaning);
  if (parts.length === 2 && PHRASAL_PARTICLE.test(parts[1]) && !NOT_VERB_START.test(parts[0])) {
    return ['v', 'phrase'];
  }
  return ['phrase'];
}

export interface CardLike {
  word: string;
  meanings: { text: string; type?: string; phonetic?: string }[];
}

const posCache = new Map<string, PosKey[]>();

export function detectPOS(card: CardLike): PosKey[] {
  const raw = String(card.word || '');
  const meaning = (card.meanings || []).map((m) => m.text).join('; ');
  const own: PosKey[] = [];
  (card.meanings || []).forEach((m) =>
    parsePosTags(m.type).forEach((t) => {
      if (!own.includes(t)) own.push(t);
    })
  );
  const ck = `${keyOf(raw)}|${own.join(',')}|${meaning}`;
  const cached = posCache.get(ck);
  if (cached) return cached;

  const clean = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const alts = clean
    .split(/\s*[/=]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const tags: PosKey[] = [];
  const add = (arr: PosKey[]) =>
    arr.forEach((t) => {
      if (!tags.includes(t)) tags.push(t);
    });

  const full = keyOf(raw);
  if (POS_FIX[full]) add(POS_FIX[full]);
  else if (own.length) add(own);
  else if (DEFAULT_POS[full]) add(DEFAULT_POS[full]);
  else alts.forEach((a) => add(posOfPhrase(a, meaning)));

  if (alts.some((a) => /\s/.test(a)) && !tags.includes('phrase')) tags.push('phrase');
  if (tags.length > 1 && tags.includes('other')) tags.splice(tags.indexOf('other'), 1);
  if (!tags.length) tags.push('other');

  const order = (t: PosKey) => POS_LIST.findIndex((p) => p[0] === t);
  tags.sort((a, b) => order(a) - order(b));
  posCache.set(ck, tags);
  return tags;
}
