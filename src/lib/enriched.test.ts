import "fake-indexeddb/auto";
import { afterAll, beforeEach, expect, it } from "vitest";
import raw from "../data/jlpt-enriched-2026-11.json";
import { db, initialize, registerEnrichedDataset, exportBackup, recordAnswer, toggleFavorite } from "./db";
import { parseDataset } from "./import";
import { characters } from "./seed";

beforeEach(async () => {
  db.close();
  await db.delete();
  await initialize({ includeBundled: false });
});
afterAll(async () => { db.close(); await db.delete(); });

it("validates all 440 enriched characters and 426 words", () => {
  const data = parseDataset(raw);
  expect(data.kanji).toHaveLength(440);
  expect(data.vocabulary).toHaveLength(426);
  expect(characters("様々だ")).toEqual(["様"]);
  for (const k of data.kanji) {
    expect(k.korean_hun?.trim()).toBeTruthy();
    expect(k.korean_eum?.trim()).toBeTruthy();
    expect(Array.isArray(k.onyomi)).toBe(true);
    expect(Array.isArray(k.kunyomi)).toBe(true);
    expect(k.meanings_ko?.length).toBeGreaterThan(0);
    expect(k.metadata_source).toBeTruthy();
  }
});

it("automatically registers once and preserves study history, favorites and corrections", async () => {
  await recordAnswer({ item_type: "vocabulary", item_id: "v:変更", question_type: "reading", selected_answer: "wrong", is_correct: false, studied_at: new Date().toISOString() });
  await toggleFavorite("vocabulary", "v:変更");
  const before = await exportBackup();
  await initialize();
  const after = await exportBackup();
  expect(after.history).toEqual(before.history);
  expect(after.progress).toEqual(before.progress);
  const k = await db.kanji.get("k:競");
  expect(k?.korean_eum).toBe("경");
  expect(k?.onyomi).toContain("キョウ");
  for (const entry of raw.kanji) {
    const stored = await db.kanji.where("character").equals(entry.character).first();
    expect(stored?.korean_hun).toBeTruthy();
    expect(stored?.meanings_ko?.length).toBeGreaterThan(0);
  }
  await db.kanji.update("k:競", { korean_hun: "사용자 수정" });
  await registerEnrichedDataset();
  expect((await db.kanji.get("k:競"))?.korean_hun).toBe("사용자 수정");
  expect(await db.vocabulary.count()).toBe(after.vocabulary.length);
});
