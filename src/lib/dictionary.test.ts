import "fake-indexeddb/auto";
import { beforeEach, afterAll, it, expect } from "vitest";
import dictionary from "../data/kanji-dictionary.json";
import evidence from "../../docs/dictionaries/extraction-evidence.json";
import book from "../data/hackers-pages-2-4.json";
import { seed } from "./seed";
import {
  db,
  initialize,
  registerBundledDataset,
  registerKanjiDictionary,
  recordAnswer,
  toggleFavorite,
  exportBackup,
  dictionaryKey,
} from "./db";
import { parseDataset, parseBackup } from "./import";
beforeEach(async () => {
  db.close();
  await db.delete();
  await initialize({ includeBundled: false });
});
afterAll(async () => {
  db.close();
  await db.delete();
});
it("covers all 227 registered characters with exact dictionary facts and no inferred readings", () => {
  const data = parseDataset(dictionary);
  expect(data.kanji).toHaveLength(227);
  const expected = new Set(
    [...book.kanji, ...seed.kanji].map((k) => k.character),
  );
  expect(new Set(data.kanji.map((k) => k.character))).toEqual(expected);
  for (const k of data.kanji) {
    const original = evidence.characters.find(
      (row) => row.character === k.character,
    )!;
    for (const [field, type] of [
      ["onyomi", "ja_on"],
      ["kunyomi", "ja_kun"],
    ] as const)
      expect(k[field]).toEqual([
        ...new Set(
          original.japanese_readings
            .filter((r) => r.type === type)
            .map((r) => r.value),
        ),
      ]);
    const pairs = original.korean_original_pairs.flatMap(([huns, eums]) =>
      huns.flatMap((hun) =>
        eums.map((eum) => ({ hun, eum: eum.replace(/\([^)]*\)/g, "").trim() })),
      ),
    );
    const unique = pairs.filter(
      (p, i, a) => a.findIndex((q) => q.hun === p.hun && q.eum === p.eum) === i,
    );
    expect(k.korean_readings).toEqual(unique);
    expect(unique).toContainEqual({ hun: k.korean_hun, eum: k.korean_eum });
    expect(k.korean_reference_character).toBe(
      original.korean_reference_character,
    );
    expect(
      k.metadata_sources?.some(
        (s) => s.field === "japanese_readings" && s.license === "CC-BY-SA-4.0",
      ),
    ).toBe(true);
  }
  expect(data.kanji.filter((k) => k.kunyomi?.length)).toHaveLength(193);
  expect(data.kanji.filter((k) => k.kunyomi?.length === 0)).toHaveLength(34);
  expect(
    data.kanji.filter((k) => k.korean_reference_character !== k.character),
  ).toHaveLength(36);
  expect(data.kanji.find((k) => k.character === "営")).toMatchObject({
    korean_reference_character: "營",
    korean_hun: "경영할",
    korean_eum: "영",
  });
  expect(data.kanji.find((k) => k.character === "信")?.kunyomi).toEqual([]);
});
it("applies dictionary supplement once without changing word data, attempts or favorites", async () => {
  await registerBundledDataset();
  await recordAnswer({
    item_type: "vocabulary",
    item_id: "v:変更",
    question_type: "reading",
    selected_answer: "wrong",
    is_correct: false,
    studied_at: new Date().toISOString(),
  });
  await toggleFavorite("kanji", "k:学");
  await toggleFavorite("vocabulary", "v:変更");
  const before = await exportBackup();
  expect(await registerKanjiDictionary()).toMatchObject({
    added: 0,
    kanji_added: 0,
    kanji_updated: 227,
    errors: [],
  });
  const after = await exportBackup();
  expect(after.history).toEqual(before.history);
  expect(after.progress).toEqual(before.progress);
  expect(after.vocabulary).toEqual(before.vocabulary);
  expect(after.kanji).toHaveLength(227);
  expect(after.kanji.every((k) => k.metadata_status === "verified")).toBe(true);
  await registerKanjiDictionary();
  expect((await exportBackup()).kanji).toEqual(after.kanji);
  expect(await db.metadata.get(dictionaryKey)).toBeDefined();
  const restored = parseBackup(JSON.parse(JSON.stringify(after)));
  expect(restored.kanji).toEqual(after.kanji);
});
it("preserves existing user dictionary values and labels conflicting fields as partially verified", async () => {
  await registerBundledDataset();
  await db.kanji.update("k:学", {
    korean_hun: "사용자 확인 훈",
    korean_eum: "사용자 확인 음",
    onyomi: ["ガク"],
    metadata_source: "사용자 확인 출처",
  });
  await registerKanjiDictionary();
  const k = (await db.kanji.get("k:学"))!;
  expect(k.korean_hun).toBe("사용자 확인 훈");
  expect(k.korean_eum).toBe("사용자 확인 음");
  expect(k.kunyomi).toContain("まな.ぶ");
  expect(k.metadata_status).toBe("partially_verified");
  expect(k.metadata_source).toContain("사용자 확인 출처");
  expect(k.metadata_sources?.some((s) => s.field === "korean_huneum")).toBe(
    false,
  );
});
it("supplements existing kanji without creating deleted or unrelated characters", async () => {
  await db.kanji.delete("k:変");
  const count = await db.kanji.count();
  await registerKanjiDictionary();
  expect(await db.kanji.count()).toBe(count);
  expect(await db.kanji.get("k:変")).toBeUndefined();
});
it("rejects unsafe source URLs and malformed huneum pairs before importing", () => {
  const k = dictionary.kanji[0];
  expect(() =>
    parseDataset({
      kanji: [
        {
          ...k,
          metadata_sources: [
            {
              label: "bad",
              field: "japanese_readings",
              url: "javascript:alert(1)",
            },
          ],
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    parseDataset({
      kanji: [{ ...k, korean_readings: [{ hun: "", eum: "일" }] }],
    }),
  ).toThrow();
});
