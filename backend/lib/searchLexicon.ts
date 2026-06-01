// ─── Search intelligence lexicon ──────────────────────────────────────────────
//
// A curated knowledge base of fashion search terms for "The Lil Edit" (kids'
// ethnic + western wear). Suggestions drawn from this lexicon are generated
// INDEPENDENTLY of the live product catalog — typing "ku" suggests "Kurti" even
// if zero Kurti products are currently in stock. This powers the Suggestions tab
// so the search box always feels intelligent, regardless of inventory.
//
// To extend: add an entry below. `aliases` are alternate spellings / synonyms
// that should match but still display the canonical `term`. `weight` (0..20) is
// a small popularity boost so common terms rank above niche ones on ties.

export type LexiconType =
  | "category"   // garment types / collections
  | "occasion"   // events the outfit is worn for
  | "fabric"     // material
  | "fit"        // cut / silhouette / embellishment style
  | "color"      // colour
  | "trend"      // merchandising / trend buckets
  | "keyword";   // gender / age / generic

export interface LexiconEntry {
  term:      string;       // canonical display label
  type:      LexiconType;
  sublabel:  string;       // shown muted on the right of the row
  aliases?:  string[];     // alternate spellings/synonyms that match this term
  weight?:   number;       // 0..20 popularity boost
}

export const SEARCH_LEXICON: LexiconEntry[] = [
  // ─── Categories / garment types ─────────────────────────────────────────────
  { term: "Lehenga Set",     type: "category", sublabel: "Category", weight: 18, aliases: ["lehnga", "lehanga", "lengha", "lehenga choli", "choli"] },
  { term: "Kurti",           type: "category", sublabel: "Category", weight: 16, aliases: ["kurthi"] },
  { term: "Kurta",           type: "category", sublabel: "Category", weight: 16, aliases: ["kurtha"] },
  { term: "Kurta Pajama",    type: "category", sublabel: "Category", weight: 14, aliases: ["kurta set", "kurta pyjama", "pathani"] },
  { term: "Sharara",         type: "category", sublabel: "Category", weight: 14, aliases: ["sharara set"] },
  { term: "Gharara",         type: "category", sublabel: "Category", weight: 10 },
  { term: "Palazzo",         type: "category", sublabel: "Category", weight: 12, aliases: ["palazzos", "palazzo set"] },
  { term: "Anarkali",        type: "category", sublabel: "Category", weight: 13 },
  { term: "Salwar Suit",     type: "category", sublabel: "Category", weight: 11, aliases: ["salwar kameez", "salwar"] },
  { term: "Patiala Suit",    type: "category", sublabel: "Category", weight: 8,  aliases: ["patiala"] },
  { term: "Dhoti Kurta",     type: "category", sublabel: "Category", weight: 9,  aliases: ["dhoti"] },
  { term: "Sherwani",        type: "category", sublabel: "Category", weight: 12 },
  { term: "Nehru Jacket",    type: "category", sublabel: "Category", weight: 9 },
  { term: "Indo-Western",    type: "category", sublabel: "Category", weight: 11, aliases: ["indo western", "fusion wear"] },
  { term: "Saree",           type: "category", sublabel: "Category", weight: 8,  aliases: ["sari", "kids saree"] },
  { term: "Blazer",          type: "category", sublabel: "Category", weight: 12 },
  { term: "Tuxedo",          type: "category", sublabel: "Category", weight: 11, aliases: ["tux"] },
  { term: "Waistcoat",       type: "category", sublabel: "Category", weight: 8,  aliases: ["vest"] },
  { term: "Jacket",          type: "category", sublabel: "Category", weight: 13 },
  { term: "Dress",           type: "category", sublabel: "Category", weight: 17, aliases: ["frock", "frocks"] },
  { term: "Gown",            type: "category", sublabel: "Category", weight: 12, aliases: ["ball gown", "evening gown"] },
  { term: "Maxi Dress",      type: "category", sublabel: "Category", weight: 9,  aliases: ["maxi"] },
  { term: "Tutu Dress",      type: "category", sublabel: "Category", weight: 8,  aliases: ["tutu"] },
  { term: "Skirt",           type: "category", sublabel: "Category", weight: 11, aliases: ["skirt set", "lehenga skirt"] },
  { term: "Top",             type: "category", sublabel: "Category", weight: 12, aliases: ["tops", "crop top"] },
  { term: "Shirt",           type: "category", sublabel: "Category", weight: 12 },
  { term: "T-Shirt",         type: "category", sublabel: "Category", weight: 13, aliases: ["tshirt", "tee", "tees"] },
  { term: "Jeans",           type: "category", sublabel: "Category", weight: 12, aliases: ["denims"] },
  { term: "Trousers",        type: "category", sublabel: "Category", weight: 9,  aliases: ["pants", "chinos"] },
  { term: "Shorts",          type: "category", sublabel: "Category", weight: 10 },
  { term: "Dungarees",       type: "category", sublabel: "Category", weight: 9,  aliases: ["dungaree", "overalls"] },
  { term: "Romper",          type: "category", sublabel: "Category", weight: 10, aliases: ["rompers", "onesie"] },
  { term: "Jumpsuit",        type: "category", sublabel: "Category", weight: 11 },
  { term: "Co-ord Set",      type: "category", sublabel: "Category", weight: 13, aliases: ["coord", "co ord", "co-ord", "matching set"] },
  { term: "Nightwear",       type: "category", sublabel: "Category", weight: 9,  aliases: ["night suit", "nightsuit", "pyjama set", "pajama set", "sleepwear"] },
  { term: "Sweater",         type: "category", sublabel: "Category", weight: 9,  aliases: ["pullover", "jumper"] },
  { term: "Sweatshirt",      type: "category", sublabel: "Category", weight: 9,  aliases: ["hoodie", "hooded"] },
  { term: "Cardigan",        type: "category", sublabel: "Category", weight: 7 },
  { term: "Ethnic Wear",     type: "category", sublabel: "Category", weight: 15, aliases: ["ethnic", "traditional wear"] },
  { term: "Western Wear",    type: "category", sublabel: "Category", weight: 14, aliases: ["western"] },

  // ─── Occasions ──────────────────────────────────────────────────────────────
  { term: "Wedding",         type: "occasion", sublabel: "Occasion", weight: 18, aliases: ["shaadi", "marriage"] },
  { term: "Festive",         type: "occasion", sublabel: "Occasion", weight: 17, aliases: ["festival"] },
  { term: "Diwali",          type: "occasion", sublabel: "Occasion", weight: 16, aliases: ["deepavali", "deewali"] },
  { term: "Eid",             type: "occasion", sublabel: "Occasion", weight: 13, aliases: ["eid ul fitr"] },
  { term: "Navratri",        type: "occasion", sublabel: "Occasion", weight: 12, aliases: ["garba", "dandiya"] },
  { term: "Raksha Bandhan",  type: "occasion", sublabel: "Occasion", weight: 11, aliases: ["rakhi"] },
  { term: "Janmashtami",     type: "occasion", sublabel: "Occasion", weight: 9,  aliases: ["krishna"] },
  { term: "Christmas",       type: "occasion", sublabel: "Occasion", weight: 11, aliases: ["xmas"] },
  { term: "Sangeet",         type: "occasion", sublabel: "Occasion", weight: 10 },
  { term: "Mehendi",         type: "occasion", sublabel: "Occasion", weight: 10, aliases: ["mehndi", "haldi"] },
  { term: "Engagement",      type: "occasion", sublabel: "Occasion", weight: 9,  aliases: ["roka"] },
  { term: "Birthday Party",  type: "occasion", sublabel: "Occasion", weight: 16, aliases: ["birthday"] },
  { term: "Party Wear",      type: "occasion", sublabel: "Occasion", weight: 15, aliases: ["party"] },
  { term: "Casual",          type: "occasion", sublabel: "Occasion", weight: 14, aliases: ["daily wear", "everyday"] },
  { term: "School Wear",     type: "occasion", sublabel: "Occasion", weight: 10, aliases: ["school", "uniform"] },
  { term: "Playwear",        type: "occasion", sublabel: "Occasion", weight: 9,  aliases: ["playtime"] },
  { term: "Pooja",           type: "occasion", sublabel: "Occasion", weight: 8,  aliases: ["puja", "puja ceremony"] },
  { term: "Naming Ceremony", type: "occasion", sublabel: "Occasion", weight: 7,  aliases: ["annaprashan", "cradle ceremony"] },

  // ─── Fabrics ────────────────────────────────────────────────────────────────
  { term: "Cotton",          type: "fabric", sublabel: "Material", weight: 16 },
  { term: "Silk",            type: "fabric", sublabel: "Material", weight: 15 },
  { term: "Banarasi Silk",   type: "fabric", sublabel: "Material", weight: 12, aliases: ["banarasi"] },
  { term: "Georgette",       type: "fabric", sublabel: "Material", weight: 11 },
  { term: "Chiffon",         type: "fabric", sublabel: "Material", weight: 10 },
  { term: "Velvet",          type: "fabric", sublabel: "Material", weight: 12 },
  { term: "Linen",           type: "fabric", sublabel: "Material", weight: 10 },
  { term: "Denim",           type: "fabric", sublabel: "Material", weight: 12 },
  { term: "Satin",           type: "fabric", sublabel: "Material", weight: 10 },
  { term: "Net",             type: "fabric", sublabel: "Material", weight: 9 },
  { term: "Organza",         type: "fabric", sublabel: "Material", weight: 10 },
  { term: "Rayon",           type: "fabric", sublabel: "Material", weight: 8 },
  { term: "Khadi",           type: "fabric", sublabel: "Material", weight: 8 },
  { term: "Chanderi",        type: "fabric", sublabel: "Material", weight: 8 },
  { term: "Brocade",         type: "fabric", sublabel: "Material", weight: 8 },
  { term: "Muslin",          type: "fabric", sublabel: "Material", weight: 7 },
  { term: "Crepe",           type: "fabric", sublabel: "Material", weight: 7 },

  // ─── Fits / silhouettes / embellishments ────────────────────────────────────
  { term: "A-Line",          type: "fit", sublabel: "Style", weight: 11, aliases: ["a line"] },
  { term: "Flared",          type: "fit", sublabel: "Style", weight: 11, aliases: ["flare", "umbrella"] },
  { term: "Slim Fit",        type: "fit", sublabel: "Style", weight: 10 },
  { term: "Regular Fit",     type: "fit", sublabel: "Style", weight: 9 },
  { term: "Embroidered",     type: "fit", sublabel: "Style", weight: 14, aliases: ["embroidery"] },
  { term: "Sequined",        type: "fit", sublabel: "Style", weight: 11, aliases: ["sequin", "sequins"] },
  { term: "Printed",         type: "fit", sublabel: "Style", weight: 12, aliases: ["print"] },
  { term: "Floral",          type: "fit", sublabel: "Style", weight: 13, aliases: ["flower", "flowers"] },
  { term: "Striped",         type: "fit", sublabel: "Style", weight: 10, aliases: ["stripes"] },
  { term: "Polka Dot",       type: "fit", sublabel: "Style", weight: 9,  aliases: ["polka", "dots"] },
  { term: "Ruffled",         type: "fit", sublabel: "Style", weight: 10, aliases: ["ruffle", "frill", "frilled"] },
  { term: "Pleated",         type: "fit", sublabel: "Style", weight: 9,  aliases: ["pleats"] },
  { term: "Mirror Work",     type: "fit", sublabel: "Style", weight: 9,  aliases: ["sheesha", "shisha"] },
  { term: "Zari Work",       type: "fit", sublabel: "Style", weight: 9,  aliases: ["zari", "zardozi"] },
  { term: "Gota Patti",      type: "fit", sublabel: "Style", weight: 8,  aliases: ["gota"] },
  { term: "Hand Block Print",type: "fit", sublabel: "Style", weight: 8,  aliases: ["block print", "hand block"] },
  { term: "Embellished",     type: "fit", sublabel: "Style", weight: 9 },

  // ─── Colours ────────────────────────────────────────────────────────────────
  { term: "Red",             type: "color", sublabel: "Colour", weight: 13 },
  { term: "Maroon",          type: "color", sublabel: "Colour", weight: 10 },
  { term: "Pink",            type: "color", sublabel: "Colour", weight: 14, aliases: ["rani pink", "baby pink"] },
  { term: "Blue",            type: "color", sublabel: "Colour", weight: 13, aliases: ["navy", "navy blue", "sky blue"] },
  { term: "Teal",            type: "color", sublabel: "Colour", weight: 10 },
  { term: "Green",           type: "color", sublabel: "Colour", weight: 12, aliases: ["bottle green", "olive", "mint"] },
  { term: "Yellow",          type: "color", sublabel: "Colour", weight: 11, aliases: ["mustard"] },
  { term: "Orange",          type: "color", sublabel: "Colour", weight: 9 },
  { term: "Peach",           type: "color", sublabel: "Colour", weight: 10 },
  { term: "Purple",          type: "color", sublabel: "Colour", weight: 10, aliases: ["lavender", "violet"] },
  { term: "White",           type: "color", sublabel: "Colour", weight: 12, aliases: ["off white", "ivory", "cream"] },
  { term: "Black",           type: "color", sublabel: "Colour", weight: 11 },
  { term: "Grey",            type: "color", sublabel: "Colour", weight: 9,  aliases: ["gray"] },
  { term: "Gold",            type: "color", sublabel: "Colour", weight: 11, aliases: ["golden"] },
  { term: "Silver",          type: "color", sublabel: "Colour", weight: 8 },
  { term: "Beige",           type: "color", sublabel: "Colour", weight: 8,  aliases: ["nude", "tan"] },
  { term: "Pastel",          type: "color", sublabel: "Colour", weight: 12, aliases: ["pastels"] },
  { term: "Multicolor",      type: "color", sublabel: "Colour", weight: 9,  aliases: ["multicolour", "rainbow"] },

  // ─── Trend / merchandising buckets ──────────────────────────────────────────
  { term: "New Arrivals",      type: "trend", sublabel: "Trending", weight: 19, aliases: ["new", "new in", "latest"] },
  { term: "Bestsellers",       type: "trend", sublabel: "Trending", weight: 18, aliases: ["best seller", "best sellers", "popular"] },
  { term: "Trending Now",      type: "trend", sublabel: "Trending", weight: 17, aliases: ["trending", "trend"] },
  { term: "Festive Collection",type: "trend", sublabel: "Trending", weight: 15, aliases: ["festive collection"] },
  { term: "Summer Collection", type: "trend", sublabel: "Trending", weight: 13, aliases: ["summer", "summer wear"] },
  { term: "Winter Collection", type: "trend", sublabel: "Trending", weight: 13, aliases: ["winter", "winter wear", "woollens"] },
  { term: "Twinning Sets",     type: "trend", sublabel: "Trending", weight: 12, aliases: ["twinning", "sibling sets", "family twinning", "matching"] },

  // ─── Gender / age / generic keywords ────────────────────────────────────────
  { term: "Boys",            type: "keyword", sublabel: "For", weight: 17, aliases: ["boy", "boys wear" ] },
  { term: "Girls",           type: "keyword", sublabel: "For", weight: 17, aliases: ["girl", "girls wear"] },
  { term: "Newborn",         type: "keyword", sublabel: "Age", weight: 11, aliases: ["new born", "0-6 months"] },
  { term: "Infants",         type: "keyword", sublabel: "Age", weight: 11, aliases: ["infant", "baby"] },
  { term: "Toddler",         type: "keyword", sublabel: "Age", weight: 11, aliases: ["toddlers", "1-3 years"] },
  { term: "Kids",            type: "keyword", sublabel: "Age", weight: 13, aliases: ["kid", "children"] },
];

// ─── Matching ─────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    for (let k = 0; k <= n; k++) prev[k] = curr[k];
  }
  return curr[n];
}

// Match-quality tiers. Aliases score a touch lower so the canonical term wins ties.
const MATCH = {
  exact:      100,
  prefix:      90,
  wordPrefix:  84,
  contains:    76,
  fuzzy:       34,
  aliasPenalty: 4,
};

/** Best match score of a single phrase against the query (0 = no match). */
function scorePhrase(text: string, q: string): number {
  const t = text.toLowerCase();
  if (t === q)                                         return MATCH.exact;
  if (t.startsWith(q))                                 return MATCH.prefix;
  if (t.split(/\s+/).some(w => w.startsWith(q)))       return MATCH.wordPrefix;
  if (t.includes(q))                                   return MATCH.contains;
  if (q.length >= 3) {
    const maxDist = q.length <= 6 ? 1 : 2;
    const fuzzy = t.split(/[\s-]+/).some(w =>
      Math.abs(w.length - q.length) <= maxDist + 1 && levenshtein(w, q) <= maxDist
    );
    if (fuzzy) return MATCH.fuzzy;
  }
  return 0;
}

export interface LexiconMatch {
  entry: LexiconEntry;
  score: number;
}

/**
 * Match a query against the curated lexicon — independent of any product data.
 * Returns the best `limit` entries, highest score first.
 */
export function matchLexicon(query: string, limit = 8): LexiconMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches: LexiconMatch[] = [];
  for (const entry of SEARCH_LEXICON) {
    let best = scorePhrase(entry.term, q);
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        const s = scorePhrase(alias, q);
        if (s > 0) best = Math.max(best, s - MATCH.aliasPenalty);
      }
    }
    if (best > 0) matches.push({ entry, score: best + (entry.weight ?? 0) });
  }

  matches.sort((a, b) => b.score - a.score || a.entry.term.localeCompare(b.entry.term));
  return matches.slice(0, limit);
}
