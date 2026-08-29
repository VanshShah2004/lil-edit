import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreEntry,
  scoreVariant,
  compareRanked,
  rankVariantRows,
  planQuery,
  MATCH_STRENGTH,
  NO_TITLE_MATCH,
  MIN_RESULT_SCORE,
  type SearchCatalogEntry,
  type SearchCatalogVariant,
} from "../lib/persistCatalog.js";
import { generateColorSku } from "../utils/skuCodes.js";

function entry(overrides: Partial<SearchCatalogEntry> & { title: string }): SearchCatalogEntry {
  return {
    id: overrides.title,
    slug: "",
    base_sku: "",
    category: "",
    category_slug: "",
    tags: [],
    badges: [],
    occasion: "",
    fabric: "",
    fit: "",
    gender: "",
    sizes: [],
    details: "",
    image: "",
    price: 0,
    original_price: 0,
    created_at: "",
    variants: [],
    ...overrides,
  };
}

function variant(inStock: boolean, colorName = ""): SearchCatalogVariant {
  // Build the SKU the way production does (utils/skuCodes.ts): `${baseSku}-${first
  // three letters of the colour}` — e.g. "Maroon" -> "TEE-001-MAR". It is NEVER the
  // colour name itself. Using the colour name here made these fixtures impossible:
  // once SKU matching entered the scorer (a74974d), a query like "maroon" hit the
  // SKU branch at title tier and these tests were asserting colour behaviour while
  // actually exercising the SKU path.
  return { sku: generateColorSku("TEE-001", colorName), colorName, colorHex: "", image: "", inStock };
}

// Mirrors the fetchSuggestions/searchProducts pipeline: score → floor → rank.
function rank(entries: SearchCatalogEntry[], q: string): Array<{ title: string; titleRank: number }> {
  const lower = q.toLowerCase();
  const scored = entries
    .map((e) => ({ entry: e, ...scoreEntry(e, lower) }))
    .filter((s) => s.score > MIN_RESULT_SCORE);
  scored.sort(compareRanked);
  return scored.map((s) => ({ title: s.entry.title, titleRank: s.titleRank }));
}

test("title-match bucket beats any non-title score, regardless of points", () => {
  const titleContains = { entry: entry({ title: "Sunflower Dress" }), score: 80, titleRank: 3, strength: 0 };
  const nonTitleHuge = { entry: entry({ title: "Aaa First Alphabetically" }), score: 99, titleRank: NO_TITLE_MATCH, strength: 0 };
  assert.ok(compareRanked(titleContains, nonTitleHuge) < 0, "weakest title match must sort before strongest non-title match");
});

test("title subtypes rank exact > starts > word-starts > contains", () => {
  const entries = [
    entry({ title: "Fredrick Tee" }),        // "fredrick" contains "red" mid-word
    entry({ title: "Bright Reddish Gown" }), // word "reddish" starts with "red"
    entry({ title: "Red Dress" }),           // title starts with "red"
    entry({ title: "Red" }),                 // exact
  ];
  const ranked = rank(entries, "red");
  assert.deepEqual(
    ranked.map((r) => r.title),
    ["Red", "Red Dress", "Bright Reddish Gown", "Fredrick Tee"],
  );
  assert.deepEqual(ranked.map((r) => r.titleRank), [0, 1, 2, 3]);
});

test("exact title match does not suppress other matches; non-title group follows by score", () => {
  const entries = [
    entry({ title: "Casual Tee", category: "Kurta Sets" }),  // category:starts (~78)
    entry({ title: "Kurta" }),                               // exact title
    entry({ title: "Krta Top" }),                            // fuzzy title (30)
    entry({ title: "Summer Set", tags: ["kurta-style"] }),   // tag:starts (~72)
  ];
  const ranked = rank(entries, "kurta").map((r) => r.title);
  assert.deepEqual(ranked, ["Kurta", "Casual Tee", "Summer Set", "Krta Top"]);
});

test("fuzzy title matches stay in the non-title bucket", () => {
  const { titleRank, field } = scoreEntry(entry({ title: "Krta Top" }), "kurta");
  assert.equal(field, "fuzzy");
  assert.equal(titleRank, NO_TITLE_MATCH);
});

test("equal-score ties break on broader stock availability", () => {
  // Both exact title matches (flat score, identical titles) — stock breadth decides.
  const wideStock = { entry: entry({ title: "Kurta", variants: [variant(true), variant(true), variant(false)] }), score: 100, titleRank: 0, strength: 0 };
  const slimStock = { entry: entry({ title: "Kurta", variants: [variant(true), variant(false), variant(false)] }), score: 100, titleRank: 0, strength: 0 };
  assert.ok(compareRanked(wideStock, slimStock) < 0);
  assert.ok(compareRanked(slimStock, wideStock) > 0);
  // A variant-less product counts as one in-stock card.
  const noVariants = { entry: entry({ title: "Kurta" }), score: 100, titleRank: 0, strength: 0 };
  assert.ok(compareRanked(wideStock, noVariants) < 0);
});

test("final tiebreak is alphabetical title", () => {
  const a = { entry: entry({ title: "Anarkali Set" }), score: 50, titleRank: NO_TITLE_MATCH, strength: 0 };
  const b = { entry: entry({ title: "Banarasi Set" }), score: 50, titleRank: NO_TITLE_MATCH, strength: 0 };
  assert.ok(compareRanked(a, b) < 0);
  assert.ok(compareRanked(b, a) > 0);
});

test("non-matches score 0 and fall below the inclusion floor", () => {
  const miss = scoreEntry(entry({ title: "Plain Tee" }), "lehenga");
  assert.equal(miss.score, 0);
  assert.ok(miss.score <= MIN_RESULT_SCORE);
  assert.deepEqual(rank([entry({ title: "Plain Tee" })], "lehenga"), []);
});

test(`every real field match clears the inclusion floor (score > ${MIN_RESULT_SCORE})`, () => {
  const cases: Array<[SearchCatalogEntry, string]> = [
    [entry({ title: "Silk Kurta" }), "kurta"],           // title
    [entry({ title: "Tee", category: "Lehenga" }), "lehenga"], // category
    [entry({ title: "Tee", tags: ["festive"] }), "festive"],   // tag
    [entry({ title: "Tee", badges: ["Sale"] }), "sale"],        // badge
    [entry({ title: "Tee", fabric: "Cotton" }), "cotton"],      // fabric
    [entry({ title: "Tee", variants: [variant(true, "Maroon")] }), "maroon"], // color
    [entry({ title: "Tee", gender: "girls" }), "girls"],        // gender
    [entry({ title: "Tee", sizes: ["3-4 Years"] }), "3-4 Years"], // size, exact
    [entry({ title: "Tee", sizes: ["3-4 Years"] }), "3-4"],       // size, prefix
    [entry({ title: "Krta Top" }), "kurta"],                    // fuzzy = 30
    [entry({ title: "Tee", details: "breathable cotton lining" }), "breathable"], // details = 10, the floor tier
  ];
  for (const [e, q] of cases) {
    const { score } = scoreEntry(e, q.toLowerCase());
    assert.ok(score > MIN_RESULT_SCORE, `"${q}" against "${e.title}" scored ${score}, expected > ${MIN_RESULT_SCORE}`);
  }
});

test("a size matches only when the query is specific enough to be one", () => {
  const e = entry({ title: "Tee", sizes: ["6-12 Months", "3-4 Years"] });

  // The two shapes a shopper actually types.
  assert.equal(scoreEntry(e, "3-4 years").field, "size");
  assert.equal(scoreEntry(e, "3-4").field, "size");
  assert.equal(scoreEntry(e, "6-12 months").field, "size");

  // Bare unit words are in EVERY size on EVERY product — matching them would
  // hand back the whole catalog, so they must not reach the size tier at all.
  assert.equal(scoreEntry(e, "years").score, 0);
  assert.equal(scoreEntry(e, "months").score, 0);

  // A size the product isn't cut in stays out of the results entirely.
  assert.equal(scoreEntry(e, "9-10 years").score, 0);
});

test("an exact size outranks a prefix, and both outrank a badge", () => {
  const exact  = scoreEntry(entry({ title: "Tee", sizes: ["3-4 Years"] }), "3-4 years");
  const prefix = scoreEntry(entry({ title: "Tee", sizes: ["3-4 Years"] }), "3-4");
  const badge  = scoreEntry(entry({ title: "Tee", badges: ["3-4 Years"] }), "3-4 years");

  assert.ok(exact.score > prefix.score);
  assert.ok(prefix.score > badge.score);
});

test("color matches score in the same tier as fabric", () => {
  const colorStarts = scoreEntry(entry({ title: "Tee", variants: [variant(true, "Maroon Set")] }), "maroon");
  const colorContains = scoreEntry(entry({ title: "Tee", variants: [variant(true, "Dark Maroon")] }), "maroon");
  const fabricStarts = scoreEntry(entry({ title: "Tee", fabric: "Maroon Silk" }), "maroon");
  const fabricContains = scoreEntry(entry({ title: "Tee", fabric: "Dark Maroon Silk" }), "maroon");

  assert.equal(colorStarts.field, "color");
  assert.equal(colorContains.field, "color");
  // Same base tier (53 for a starts-with hit, 50 for contains) before the fractional match-quality bonus.
  assert.ok(Math.abs(colorStarts.score - fabricStarts.score) < 2);
  assert.ok(Math.abs(colorContains.score - fabricContains.score) < 2);
  assert.ok(colorStarts.score > colorContains.score);
});

test("color scans all variants for the best-scoring match", () => {
  const e = entry({
    title: "Tee",
    variants: [variant(true, "Dark Navy Contains"), variant(true, "Navy")],
  });
  const { score, field } = scoreEntry(e, "navy");
  const exactVariant = scoreEntry(entry({ title: "Tee", variants: [variant(true, "Navy")] }), "navy");
  assert.equal(field, "color");
  assert.equal(score, exactVariant.score, "the starts-with variant should win over the weaker contains variant");
});

test("product-details matches are the weakest tier, below fuzzy", () => {
  const details = scoreEntry(entry({ title: "Tee", details: "hand-embroidered mirror work" }), "embroidered");
  const fuzzy = scoreEntry(entry({ title: "Krta Top" }), "kurta");
  assert.equal(details.field, "details");
  assert.equal(details.titleRank, NO_TITLE_MATCH);
  assert.ok(details.score < fuzzy.score);
});

test("a colour search ranks ONLY the matching colourway cards, not all colours", () => {
  const e = entry({
    title: "Festive Kurta Set",
    variants: [variant(true, "Maroon"), variant(true, "Blue"), variant(false, "Dark Maroon")],
  });
  const kept = rankVariantRows([e], "maroon").map((r) => r.color.name);
  // Blue matches nothing on its own, so its card is excluded entirely.
  assert.deepEqual(kept, ["Maroon", "Dark Maroon"]);
});

test("non-colour matches keep every colour variant as its own card", () => {
  const e = entry({
    title: "Maroon-free Kurta", // title match — every colourway ranks on it
    variants: [variant(true, "Maroon"), variant(true, "Blue")],
  });
  const rows = rankVariantRows([e], "kurta");
  assert.deepEqual(rows.map((r) => r.color.name), ["Maroon", "Blue"]);
});

test("variants are scored individually: colour variant outranks its non-matching sibling", () => {
  const e = entry({
    title: "Tee",
    details: "pairs well with maroon accessories", // sibling's only signal (10 pts)
    variants: [variant(true, "Blue"), variant(true, "Maroon")],
  });
  const maroon = scoreVariant(e, e.variants[1]!, "maroon");
  const blue = scoreVariant(e, e.variants[0]!, "maroon");
  assert.equal(maroon.field, "color");
  assert.equal(blue.field, "details");
  assert.ok(maroon.score > blue.score);
  // Full pipeline: maroon card first, blue card last (details tier).
  assert.deepEqual(rankVariantRows([e], "maroon").map((r) => r.color.name), ["Maroon", "Blue"]);
});

test("equal-score variant cards rank in-stock before out-of-stock", () => {
  const e = entry({
    title: "Kurta", // exact title — both variants score a flat 100
    variants: [variant(false, "Maroon"), variant(true, "Blue")],
  });
  assert.deepEqual(rankVariantRows([e], "kurta").map((r) => r.color.name), ["Blue", "Maroon"]);
});

test("sibling variants can land far apart — each card ranks purely on its own score", () => {
  // Query "maroon". P1's two colourways score very differently:
  //   Maroon → color:starts (~54.9) — first
  //   Blue   → details only (10)    — dead last, with four other products in between
  const p1 = entry({
    title: "Zari Anarkali",
    details: "maroon dupatta included",
    variants: [variant(true, "Maroon"), variant(true, "Blue")],
  });
  const p2 = entry({ title: "Silk Tee", fabric: "Maroon Silk" });        // fabric:starts ~54.3
  const p3 = entry({ title: "Cotton Tee", fit: "Maroon Fit" });          // fit:starts    ~51.3
  const p4 = entry({ title: "Linen Tee", fit: "Dark Maroon Fit" });      // fit:contains  ~48.9
  const p5 = entry({ title: "Marron Frock" });                           // fuzzy title    30

  const rows = rankVariantRows([p1, p2, p3, p4, p5], "maroon");
  assert.deepEqual(
    rows.map((r) => r.color.name || r.title),
    ["Maroon", "Silk Tee", "Cotton Tee", "Linen Tee", "Marron Frock", "Blue"],
  );
  // Same product, positions 1 and 6.
  assert.equal(rows.findIndex((r) => r.color.name === "Maroon"), 0);
  assert.equal(rows.findIndex((r) => r.color.name === "Blue"), 5);
});

test("a variant-less product still ranks as a single base card", () => {
  const rows = rankVariantRows([entry({ title: "Kurta" })], "kurta");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.inStock, true);
});

test("details matches rank below every other non-title tier (gender, the next-weakest tier)", () => {
  const detailsOnly = scoreEntry(entry({ title: "Tee A", details: "soft breathable cotton feel" }), "breathable");
  const genderOnly = scoreEntry(entry({ title: "Tee B", gender: "girls" }), "girls");
  assert.ok(detailsOnly.score < genderOnly.score);
});

// ─── Multi-word progressive relaxation ────────────────────────────────────────

test("planQuery: tokens drop stopwords, 1-char words, and duplicates; chunks need 3+ words", () => {
  assert.deepEqual(planQuery("kurta"), { phrase: "kurta", tokens: [], chunks: [] });
  assert.deepEqual(planQuery("maroon kurta"), { phrase: "maroon kurta", tokens: ["maroon", "kurta"], chunks: [] });
  assert.deepEqual(planQuery("the kurta"), { phrase: "the kurta", tokens: ["kurta"], chunks: [] });
  assert.deepEqual(planQuery("of the"), { phrase: "of the", tokens: [], chunks: [] });
  assert.deepEqual(planQuery("red red kurta").tokens, ["red", "kurta"]);
  assert.deepEqual(planQuery("red silk kurta"), {
    phrase: "red silk kurta",
    tokens: ["red", "silk", "kurta"],
    chunks: ["red silk", "silk kurta"],
  });
});

test("single-word queries keep exactly the old behaviour (phrase strength, same tiers)", () => {
  const m = scoreEntry(entry({ title: "Silk Kurta" }), "kurta");
  assert.equal(m.field, "title");
  assert.equal(m.titleRank, 3); // word-equal quirk: "kurta" === token, so contains tier
  assert.equal(m.strength, MATCH_STRENGTH.phrase);
  const miss = scoreEntry(entry({ title: "Plain Tee" }), "lehenga");
  assert.equal(miss.score, 0);
  assert.equal(miss.strength, MATCH_STRENGTH.phrase);
});

test("strength buckets order results at equal title rank: phrase > all-words > single word", () => {
  // Query "silk kurta" — all three land in the non-title bucket (rank 4).
  const phraseHit = entry({ title: "Tee A", fabric: "Silk Kurta Blend" });      // phrase matches fabric
  const allWordsHit = entry({ title: "Tee B", fabric: "Silk", category: "Kurta Sets" }); // both words, different fields
  const oneWordHit = entry({ title: "Tee C", fabric: "Silk" });                 // only "silk" matches
  const ranked = rank([oneWordHit, allWordsHit, phraseHit], "silk kurta");
  assert.deepEqual(ranked.map((r) => r.title), ["Tee A", "Tee B", "Tee C"]);
  // Strength decides even though the all-words entry's best score (category ~78)
  // beats the phrase entry's fabric score (~54).
  const s = (e: SearchCatalogEntry) => scoreEntry(e, "silk kurta");
  assert.equal(s(phraseHit).strength, MATCH_STRENGTH.phrase);
  assert.equal(s(allWordsHit).strength, MATCH_STRENGTH.allWords);
  assert.equal(s(oneWordHit).strength, MATCH_STRENGTH.word);
  assert.ok(s(allWordsHit).score > s(phraseHit).score);
});

test('"vansh product": no phrase match still returns per-word matches instead of nothing', () => {
  const vanshHit = entry({ title: "Vansh Kurta" });                       // "vansh" hits the title
  const productHit = entry({ title: "Basic Tee", details: "our product line" }); // "product" only in details
  const ranked = rank([productHit, vanshHit], "vansh product");
  assert.deepEqual(ranked.map((r) => r.title), ["Vansh Kurta", "Basic Tee"]);
  // Both are word fallbacks; the title hit leads via its title rank.
  assert.equal(scoreEntry(vanshHit, "vansh product").titleRank, 1); // title starts with "vansh"
  assert.equal(scoreEntry(productHit, "vansh product").titleRank, NO_TITLE_MATCH);
});

test("matching ALL words outranks matching one word at the same title rank", () => {
  // Query "vansh product": both entries hit the title via "vansh" (rank 2),
  // but only the first also matches "product" (in details) — all-words wins,
  // even though the single-word entry's raw score is slightly higher.
  const bothWords = entry({ title: "Vansh Kurta", details: "product info sheet" });
  const oneWord = entry({ title: "Vansh Tee" });
  const ranked = rank([oneWord, bothWords], "vansh product");
  assert.deepEqual(ranked.map((r) => r.title), ["Vansh Kurta", "Vansh Tee"]);
  assert.equal(scoreEntry(bothWords, "vansh product").strength, MATCH_STRENGTH.allWords);
  assert.equal(scoreEntry(oneWord, "vansh product").strength, MATCH_STRENGTH.word);
});

test("stopwords only count inside the full phrase, never as standalone words", () => {
  // "the kurta": "the" is dropped; matching "kurta" means matching ALL words.
  const m = scoreEntry(entry({ title: "Silk Kurta" }), "the kurta");
  assert.ok(m.score > MIN_RESULT_SCORE);
  assert.equal(m.strength, MATCH_STRENGTH.allWords);
  // An all-stopword query can only match as a phrase.
  assert.deepEqual(rank([entry({ title: "Plain Tee" })], "of the"), []);
  const phraseOnly = scoreEntry(entry({ title: "Tee", details: "one of the best" }), "of the");
  assert.equal(phraseOnly.strength, MATCH_STRENGTH.phrase);
  assert.ok(phraseOnly.score > MIN_RESULT_SCORE);
});

test("fuzzy runs on words of 2+ chars in word attempts", () => {
  // "gown rd": "rd" matches nothing directly but fuzzy-hits title word "red"
  // (distance 1) — without 2-char fuzzy the all-words attempt would fail.
  const m = scoreEntry(entry({ title: "Red Gown" }), "gown rd");
  assert.equal(m.strength, MATCH_STRENGTH.allWords);
  assert.ok(m.score > MIN_RESULT_SCORE);
  // Typo'd word in a multi-word query still finds the product.
  const typo = scoreEntry(entry({ title: "Festive Kurta" }), "festive kurtta");
  assert.equal(typo.strength, MATCH_STRENGTH.allWords);
});

test("contiguous chunks of a 3+ word query match as their own bucket", () => {
  // "red silk kurta" against a product matching only "silk kurta" as a phrase:
  // the AND attempt fails (no "red"), but the chunk clears at strength 2.
  const chunkHit = entry({ title: "Silk Kurta Set" });
  const oneWordHit = entry({ title: "Silk Scarf" }); // only "silk" matches (also rank 1)
  const m = scoreEntry(chunkHit, "red silk kurta");
  assert.equal(m.strength, MATCH_STRENGTH.chunk);
  assert.equal(m.titleRank, 1); // "silk kurta set" starts with the chunk
  const ranked = rank([oneWordHit, chunkHit], "red silk kurta");
  assert.deepEqual(ranked.map((r) => r.title), ["Silk Kurta Set", "Silk Scarf"]);
});

test("multi-word colour queries rank the matching colourway above its siblings", () => {
  // "maroon kurta": the maroon colourway matches all words (title + its colour),
  // the blue colourway only matches "kurta" — same title rank, weaker strength.
  const e = entry({
    title: "Kurta Set",
    variants: [variant(true, "Blue"), variant(true, "Maroon")],
  });
  const rows = rankVariantRows([e], "maroon kurta");
  assert.deepEqual(rows.map((r) => r.color.name), ["Maroon", "Blue"]);
  // The product-level match remembers which word hit the colour, so the
  // suggestions dropdown can point at the maroon colourway's image/sku.
  assert.equal(scoreEntry(e, "maroon kurta").colorHit, "maroon");
  // Single-word colour queries keep the old colorHit shape (the whole query).
  assert.equal(scoreEntry(e, "maroon").colorHit, "maroon");
});

test("word-fallback matches still clear the inclusion floor", () => {
  const cases: Array<[SearchCatalogEntry, string]> = [
    [entry({ title: "Tee", details: "vansh signature stitching" }), "vansh product"], // details via word
    [entry({ title: "Tee", tags: ["festive"] }), "festive lehenga"],                  // tag via word
  ];
  for (const [e, q] of cases) {
    const { score } = scoreEntry(e, q);
    assert.ok(score > MIN_RESULT_SCORE, `"${q}" against "${e.title}" scored ${score}`);
  }
});
