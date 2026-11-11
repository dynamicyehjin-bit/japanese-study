import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import raw from "../data/jlpt-nov12.json";
import { parseDataset } from "./import";
import { db, initialize, exportBackup, registerSupplement, toggleFavorite } from "./db";
it("registers all document words with complete kanji without resetting progress", async () => {
  const data = parseDataset(raw);
  expect(data.vocabulary).toHaveLength(146);
  expect(data.kanji).toHaveLength(178);
  for (const k of data.kanji) {
    expect(k.korean_hun).toBeTruthy(); expect(k.korean_eum).toBeTruthy();
    expect(Array.isArray(k.onyomi)).toBe(true); expect(Array.isArray(k.kunyomi)).toBe(true);
    expect(k.meanings_ko?.length).toBeGreaterThan(0);
  }
  await db.delete(); await initialize();
  for (const v of data.vocabulary) expect(await db.vocabulary.get(v.id)).toBeDefined();
  await toggleFavorite("vocabulary", "v:渡す");
  const before = await exportBackup();
  await registerSupplement(parseDataset(raw), "dataset:jlpt-nov12:1");
  const after = await exportBackup();
  expect(after.progress).toEqual(before.progress);
  expect(after.history).toEqual(before.history);
  expect(after.vocabulary).toEqual(before.vocabulary);
  db.close(); await db.delete();
});
