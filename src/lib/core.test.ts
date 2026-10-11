import "fake-indexeddb/auto";
import { beforeEach, afterAll, describe, expect, it } from "vitest";
import {
  db,
  initialize,
  recordAnswer,
  toggleFavorite,
  mergeDataset,
  exportBackup,
  restoreBackup,
} from "./db";
import { parseBackup, parseCSV, parseDataset } from "./import";
import { createQuiz, reviewIds } from "./quiz";
import { seed } from "./seed";
beforeEach(async () => {
  db.close();
  await db.delete();
  await initialize({ includeBundled: false });
});
afterAll(async () => {
  db.close();
  await db.delete();
});
const answer = (correct: boolean) => ({
  item_type: "vocabulary" as const,
  item_id: seed.vocabulary[0].id,
  question_type: "reading" as const,
  selected_answer: correct ? "へんこう" : "ことわる",
  is_correct: correct,
  studied_at: new Date().toISOString(),
});
describe("퀴즈 생성", () => {
  it("creates unique valid options and uses word-level correct answers", () => {
    for (const mode of ["reading", "meaning", "mixed"] as const) {
      const questions = createQuiz(seed.vocabulary, seed.vocabulary, mode);
      expect(questions).toHaveLength(6);
      for (const q of questions) {
        expect(new Set(q.options).size).toBe(4);
        expect(q.options).toContain(q.answer);
        expect(q.answer).toBe(
          q.type === "reading" ? q.word.reading : q.word.meanings_ko.join(", "),
        );
      }
    }
  });
  it("excludes alternatives with overlapping meanings", () => {
    const pool = [{ ...seed.vocabulary[0], meanings_ko: ["변경", "변화"] }];
    const all = [
      ...pool,
      ...seed.vocabulary.slice(1).map((v) => ({ ...v, meanings_ko: ["변화"] })),
    ];
    expect(createQuiz(pool, all, "meaning")).toHaveLength(0);
  });
  it("excludes questions when there are insufficient distinct options", () => {
    expect(
      createQuiz(
        seed.vocabulary.slice(0, 3),
        seed.vocabulary.slice(0, 3),
        "reading",
      ),
    ).toHaveLength(0);
    const duplicate = seed.vocabulary.map((v) => ({
      ...v,
      reading: "へんこう",
    }));
    expect(createQuiz(duplicate, duplicate, "reading")).toHaveLength(0);
  });
});
describe("데이터 검증 및 병합", () => {
  it("parses quoted CSV and multi-meaning cells", () => {
    const data = parseCSV(
      '\uFEFFword,reading,meanings_ko\r\n"変更",へんこう,"변경|변화"\r\n',
    );
    expect(data.vocabulary[0].meanings_ko).toEqual(["변경", "변화"]);
    expect(data.kanji).toHaveLength(2);
    expect(data.kanji[0].onyomi).toEqual([]);
  });
  it("rejects malformed, empty, duplicate and unknown linked data", () => {
    for (const data of [
      [],
      [{ word: "変更", reading: "", meanings_ko: ["변경"] }],
      [seed.vocabulary[0], seed.vocabulary[0]],
      [{ ...seed.vocabulary[0], kanji_ids: ["unknown"] }],
      [{ ...seed.vocabulary[0], meanings_ko: [""] }],
    ])
      expect(() => parseDataset(data)).toThrow();
    expect(() =>
      parseCSV('word,reading,meanings_ko\n"変更,へんこう,변경'),
    ).toThrow();
  });
  it("merges existing words without losing records or favorites", async () => {
    await recordAnswer(answer(false));
    await toggleFavorite("vocabulary", seed.vocabulary[0].id);
    const updated = { ...seed.vocabulary[0], meanings_ko: ["변경", "변화"] };
    expect(await mergeDataset(parseDataset([updated]))).toMatchObject({
      added: 0,
      updated: 1,
    });
    expect(await db.vocabulary.count()).toBe(6);
    expect(await db.history.count()).toBe(1);
    expect(
      (await db.progress.get(["vocabulary", updated.id]))?.is_favorite,
    ).toBe(true);
    expect(
      (await db.progress.get(["vocabulary", updated.id]))?.wrong_count,
    ).toBe(1);
  });
  it("imports a new word and preserves known kanji details on partial update", async () => {
    await mergeDataset(
      parseDataset({
        vocabulary: [seed.vocabulary[0]],
        kanji: [{ character: "変", onyomi: ["ヘン"] }],
      }),
    );
    await mergeDataset(
      parseDataset([
        { word: "変更", reading: "へんこう", meanings_ko: ["변경"] },
      ]),
    );
    expect((await db.kanji.get("k:変"))?.onyomi).toEqual(["ヘン"]);
  });
});
describe("학습 저장과 백업", () => {
  it("saves all attempts and one aggregate progress record across reopening", async () => {
    await recordAnswer(answer(false));
    await recordAnswer(answer(false));
    await recordAnswer(answer(true));
    db.close();
    await db.open();
    expect(await db.history.count()).toBe(3);
    expect(await db.progress.count()).toBe(1);
    const p = (await db.progress.toArray())[0];
    expect(p.correct_count).toBe(1);
    expect(p.wrong_count).toBe(2);
    expect(reviewIds([p]).has(p.item_id)).toBe(true);
  });
  it("persists favorite add and remove for words and kanji", async () => {
    for (const [type, id] of [
      ["vocabulary", "v:変更"],
      ["kanji", "k:変"],
    ] as const) {
      await toggleFavorite(type, id);
      expect((await db.progress.get([type, id]))?.is_favorite).toBe(true);
      await toggleFavorite(type, id);
      expect((await db.progress.get([type, id]))?.is_favorite).toBe(false);
    }
  });
  it("exports and atomically restores full records, words and favorites", async () => {
    await recordAnswer(answer(false));
    await toggleFavorite("kanji", "k:変");
    const backup = parseBackup(
      JSON.parse(JSON.stringify(await exportBackup())),
    );
    await recordAnswer(answer(true));
    await restoreBackup(backup);
    expect(await exportBackup()).toMatchObject({
      kanji: backup.kanji,
      vocabulary: backup.vocabulary,
      history: backup.history,
      progress: backup.progress,
    });
  });
  it("rejects damaged backups before any writes", async () => {
    await recordAnswer(answer(false));
    const backup = await exportBackup();
    expect(() =>
      parseBackup({
        ...backup,
        history: [{ ...backup.history[0], item_id: "missing" }],
      }),
    ).toThrow();
    expect(() =>
      parseBackup({
        ...backup,
        progress: backup.progress.map((p) => ({ ...p, wrong_count: 99 })),
      }),
    ).toThrow();
    expect(await db.history.count()).toBe(1);
  });
});
