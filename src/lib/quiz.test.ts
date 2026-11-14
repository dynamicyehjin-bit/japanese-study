import { describe, expect, it } from "vitest";
import { createQuiz } from "./quiz";
import type { Vocabulary } from "./types";

const word = (surface: string, reading: string, meaning: string): Vocabulary => ({
  id: "v:" + surface,
  word: surface,
  reading,
  meanings_ko: [meaning],
  kanji_ids: Array.from(surface).filter(char => /[\u3400-\u9fff]/.test(char)).map(char => "k:" + char),
});

describe("similarity-based quiz distractors", () => {
  const items = [
    word("渡す", "わたす", "건네주다"),
    word("渡る", "わたる", "건너다"),
    word("手渡す", "てわたす", "직접 건네주다"),
    word("引き渡す", "ひきわたす", "인도하다"),
    word("受け取る", "うけとる", "받다"),
    word("届く", "とどく", "도착하다"),
    word("届ける", "とどける", "전달하다"),
    word("送る", "おくる", "보내다"),
    word("貸す", "かす", "빌려주다"),
    word("借りる", "かりる", "빌리다"),
    word("払う", "はらう", "지불하다"),
  ];

  it("prefers phonetically similar readings instead of unrelated random choices", () => {
    const quiz = createQuiz([items[0]], items, "reading");
    expect(quiz).toHaveLength(1);
    const choices = quiz[0].options;
    expect(choices).toHaveLength(4);
    expect(new Set(choices).size).toBe(4);
    expect(choices).toContain("わたす");
    expect(choices).toContain("わたる");
    expect(choices).toContain("てわたす");
  });

  it("uses distinct plausible Korean meanings and retains the only keyed answer", () => {
    const quiz = createQuiz([items[0]], items, "meaning");
    expect(quiz).toHaveLength(1);
    expect(quiz[0].answer).toBe("건네주다");
    expect(quiz[0].options).toHaveLength(4);
    expect(new Set(quiz[0].options).size).toBe(4);
    expect(quiz[0].options).toContain("건네주다");
  });

  it("never shows duplicated readings even when different words share a reading", () => {
    const same = word("別語", "わたる", "별개의 말");
    const result = createQuiz([items[0]], [...items, same], "reading");
    expect(result).toHaveLength(1);
    expect(new Set(result[0].options).size).toBe(4);
  });

  it("does not turn an identical Korean meaning into a competing option", () => {
    const duplicate = word("別表記", "べつひょうき", "건네주다");
    const result = createQuiz([items[0]], [...items, duplicate], "meaning");
    expect(result).toHaveLength(1);
    expect(result[0].options.filter(x => x === "건네주다")).toHaveLength(1);
  });

  it("skips questions if fewer than three distinct valid distractors exist", () => {
    expect(createQuiz([items[0]], items.slice(0, 3), "reading")).toEqual([]);
  });

  it("keeps the mixed quiz types alternating for generated questions", () => {
    const result = createQuiz(items, items, "mixed", 6);
    expect(result.map(x => x.type)).toEqual([
      "reading", "meaning", "reading", "meaning", "reading", "meaning",
    ]);
  });
});
