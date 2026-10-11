import type { Dataset } from "./types";
export const vocabularyId = (word: string) =>
  `v:${word.normalize("NFC").trim()}`;
export const kanjiId = (character: string) => `k:${character}`;
export function characters(word: string): string[] {
  return [...new Set(word.match(/\p{Script=Han}/gu) ?? [])];
}
export const seed: Dataset = {
  kanji: [
    ...new Set(
      ["変更", "断る", "関係", "予定", "必要", "間に合う"].flatMap(characters),
    ),
  ].map((character) => ({
    id: kanjiId(character),
    character,
    korean_hun: "",
    korean_eum: "",
    onyomi: [],
    kunyomi: [],
    meanings_ko: [],
    source: "사용자 제공 단어의 구성 한자 · 상세 정보 미등록",
  })),
  vocabulary: [
    ["変更", "へんこう", "변경"],
    ["断る", "ことわる", "거절하다"],
    ["関係", "かんけい", "관계"],
    ["予定", "よてい", "예정"],
    ["必要", "ひつよう", "필요"],
    ["間に合う", "まにあう", "시간에 맞다"],
  ].map(([word, reading, meaning]) => ({
    id: vocabularyId(word),
    word,
    reading,
    meanings_ko: [meaning],
    kanji_ids: characters(word).map(kanjiId),
    source: "사용자 제공 예시",
  })),
};
