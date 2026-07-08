import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreEntry,
  scoreVariant,
  compareRanked,
  rankVariantRows,
  NO_TITLE_MATCH,
  MIN_RESULT_SCORE,
  type SearchCatalogEntry,
  type SearchCatalogVariant,
} from "../lib/persistCatalog.js";

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
    details: "",
    image: "",
    price: 0,
    original_price: 0,
    variants: [],
    ...overrides,
  };
}

function variant(inStock: boolean, colorName = ""): SearchCatalogVariant {
  return { sku: colorName, colorName, colorHex: "", image: "", inStock };
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
  const titleContains = { entry: entry({ title: "Sunflower Dress" }), score: 80, titleRank: 3 };
  const nonTitleHuge = { entry: entry({ title: "Aaa First Alphabetically" }), score: 99, titleRank: NO_TITLE_MATCH };
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
  const wideStock = { entry: entry({ title: "Kurta", variants: [variant(true), variant(true), variant(false)] }), score: 100, titleRank: 0 };
  const slimStock = { entry: entry({ title: "Kurta", variants: [variant(true), variant(false), variant(false)] }), score: 100, titleRank: 0 };
  assert.ok(compareRanked(wideStock, slimStock) < 0);
  assert.ok(compareRanked(slimStock, wideStock) > 0);
  // A variant-less product counts as one in-stock card.
  const noVariants = { entry: entry({ title: "Kurta" }), score: 100, titleRank: 0 };
  assert.ok(compareRanked(wideStock, noVariants) < 0);
});

test("final tiebreak is alphabetical title", () => {
  const a = { entry: entry({ title: "Anarkali Set" }), score: 50, titleRank: NO_TITLE_MATCH };
  const b = { entry: entry({ title: "Banarasi Set" }), score: 50, titleRank: NO_TITLE_MATCH };
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
    [entry({ title: "Krta Top" }), "kurta"],                    // fuzzy = 30
    [entry({ title: "Tee", details: "breathable cotton lining" }), "breathable"], // details = 10, the floor tier
  ];
  for (const [e, q] of cases) {
    const { score } = scoreEntry(e, q.toLowerCase());
    assert.ok(score > MIN_RESULT_SCORE, `"${q}" against "${e.title}" scored ${score}, expected > ${MIN_RESULT_SCORE}`);
  }
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
