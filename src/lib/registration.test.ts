import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, afterAll, it, expect } from "vitest";
import raw from "../data/hackers-pages-2-4.json";
import {
  db,
  initialize,
  registerBundledDataset,
  mergeDataset,
  recordAnswer,
  toggleFavorite,
  exportBackup,
  bundledKey,
} from "./db";
import { parseDataset, parseBackup } from "./import";
import { seed } from "./seed";
import { createQuiz } from "./quiz";
beforeEach(async () => {
  db.close();
  await db.delete();
  await initialize({ includeBundled: false });
});
afterAll(async () => {
  db.close();
  await db.delete();
});
it("registers supplied data with mapped links, null fields and separate book stars", async () => {
  const data = parseDataset(raw);
  expect(data.vocabulary).toHaveLength(144);
  expect(data.kanji).toHaveLength(221);
  const report = await registerBundledDataset();
  expect(report).toEqual({
    added: 144,
    updated: 0,
    kanji_added: 216,
    kanji_updated: 5,
    duplicates: 5,
    errors: [],
  });
  expect(await db.vocabulary.count()).toBe(150);
  expect(await db.kanji.count()).toBe(227);
  expect(await db.progress.count()).toBe(0);
  for (const v of data.vocabulary) {
    const stored = await db.vocabulary.get(v.id);
    expect(stored?.kanji_ids).toEqual(v.kanji_ids);
    for (const id of stored!.kanji_ids)
      expect(await db.kanji.get(id)).toBeDefined();
  }
  expect(
    (await db.vocabulary.toArray()).filter((v) => v.starred_in_book),
  ).toHaveLength(64);
  for (const k of data.kanji) {
    expect(await db.kanji.get(k.id)).toMatchObject({
      korean_hun: null,
      korean_eum: null,
      onyomi: null,
      kunyomi: null,
      meanings_ko: null,
      metadata_status: "needs_verified_dictionary",
    });
  }
  for (const mode of ["reading", "meaning", "mixed"] as const) {
    expect(
      createQuiz(data.vocabulary, await db.vocabulary.toArray(), mode),
    ).toHaveLength(10);
    for (const v of data.vocabulary)
      expect(createQuiz([v], await db.vocabulary.toArray(), mode)).toHaveLength(
        1,
      );
  }
  const backup = parseBackup(await exportBackup());
  expect(backup.vocabulary.filter((v) => v.starred_in_book)).toHaveLength(64);
  expect(backup.kanji.find((k) => k.id === "k:一")?.onyomi).toBeNull();
});
it("merges duplicate registrations without touching history or favorites", async () => {
  await registerBundledDataset();
  const v = (await db.vocabulary.get("v:改札"))!;
  await recordAnswer({
    item_type: "vocabulary",
    item_id: v.id,
    question_type: "reading",
    selected_answer: "wrong",
    is_correct: false,
    studied_at: new Date().toISOString(),
  });
  await toggleFavorite("vocabulary", v.id);
  await toggleFavorite("kanji", "k:改");
  const before = await exportBackup();
  const report = await mergeDataset(parseDataset(raw));
  expect(report).toMatchObject({
    added: 0,
    kanji_added: 0,
    updated: 144,
    kanji_updated: 221,
    duplicates: 365,
    errors: [],
  });
  const after = await exportBackup();
  expect(after.history).toEqual(before.history);
  expect(after.progress).toEqual(before.progress);
  expect(after.vocabulary).toHaveLength(150);
  expect(after.kanji).toHaveLength(227);
  db.close();
  await initialize();
  expect((await exportBackup()).history).toEqual(before.history);
  expect(await db.metadata.get(bundledKey)).toBeDefined();
});
it("supports verified dictionary supplements and preserves details against null updates", async () => {
  await registerBundledDataset();
  await mergeDataset(
    parseDataset({
      kanji: [
        {
          id: "dictionary:改",
          character: "改",
          korean_hun: "고칠",
          korean_eum: "개",
          onyomi: ["カイ"],
          kunyomi: ["あらた.める"],
          meanings_ko: ["고치다"],
          metadata_status: "verified",
          metadata_source: "테스트용 검증 사전 fixture",
        },
      ],
    }),
  );
  await mergeDataset(parseDataset(raw));
  expect(await db.kanji.get("k:改")).toMatchObject({
    korean_hun: "고칠",
    onyomi: ["カイ"],
    metadata_status: "verified",
    metadata_source: "테스트용 검증 사전 fixture",
  });
});
it("upgrades an existing version 1 database without losing any user records", async () => {
  db.close();
  await db.delete();
  const old = new Dexie("kotoba-n3");
  old
    .version(1)
    .stores({
      kanji: "id,&character",
      vocabulary: "id,&word",
      history: "++id,[item_type+item_id],studied_at",
      progress: "[item_type+item_id],item_type,item_id",
    });
  await old.open();
  await old.table("kanji").bulkAdd(seed.kanji);
  await old.table("vocabulary").bulkAdd(seed.vocabulary);
  const history = {
    id: 1,
    item_type: "vocabulary",
    item_id: "v:変更",
    question_type: "reading",
    selected_answer: "wrong",
    is_correct: false,
    studied_at: new Date().toISOString(),
  };
  const progress = {
    item_type: "vocabulary",
    item_id: "v:変更",
    correct_count: 0,
    wrong_count: 1,
    last_studied_at: history.studied_at,
    next_review_at: history.studied_at,
    is_favorite: true,
  };
  await old.table("history").add(history);
  await old.table("progress").add(progress);
  old.close();
  await initialize();
  expect(await db.history.toArray()).toEqual([history]);
  expect(await db.progress.toArray()).toEqual([progress]);
  expect(await db.vocabulary.count()).toBe(150);
  expect(await db.kanji.count()).toBe(227);
});
it("rolls back partial imports when a supplied link is broken", async () => {
  const before = await exportBackup();
  await expect(
    mergeDataset({
      kanji: [],
      vocabulary: [{ ...seed.vocabulary[0], kanji_ids: ["missing"] }],
    }),
  ).rejects.toThrow();
  expect((await exportBackup()).vocabulary).toEqual(before.vocabulary);
  expect(() =>
    parseDataset({
      ...raw,
      vocabulary: [{ ...raw.vocabulary[0], kanji_ids: ["kanji:missing"] }],
    }),
  ).toThrow();
});
