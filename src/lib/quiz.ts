import type { Mode, Question, QuestionType, StudyProgress, Vocabulary } from "./types";

export const shuffle = <T>(items: T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// Katakana and hiragana must be compared phonetically, not by Unicode block.
const normalizeReading = (value: string) =>
  value.normalize("NFKC").replace(/[ァ-ヶ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  ).replace(/\s+/g, "");

const normalizeMeaning = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/[\s,，、·ㆍ.\/()[\]!?！？。]+/g, "");

const chars = (value: string) => Array.from(value);
const lengthSimilarity = (a: string, b: string) =>
  Math.min(chars(a).length, chars(b).length) /
  Math.max(chars(a).length, chars(b).length, 1);

function editSimilarity(a: string, b: string): number {
  const left = chars(a);
  const right = chars(b);
  if (!left.length || !right.length) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + Number(left[i - 1] !== right[j - 1]),
      );
      diagonal = above;
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

const meaningText = (word: Vocabulary) => word.meanings_ko.join(", ");
const answerFor = (word: Vocabulary, type: QuestionType) =>
  type === "reading" ? word.reading.trim() : meaningText(word).trim();

const meaningTokens = (word: Vocabulary) =>
  new Set(
    word.meanings_ko
      .flatMap((meaning) => meaning.match(/[가-힣]{2,}|[a-zA-Z]{2,}/g) ?? [])
      .map((token) => token.toLowerCase())
      .filter((token) => !["하다", "되다", "있다", "없다", "하는", "것"].includes(token)),
  );

// Broad meaning families are used only to rank plausible distractors.
// They are never used as synonyms or to determine the correct answer.
const meaningFamilies: RegExp[] = [
  /건네|전달|인도|보내|받다|접수|빌려|빌리|도착|건너/,
  /돈|금액|대금|요금|가격|비용|지불|입금|출금|청구|매출|수익|판매|구매/,
  /생각|고민|기억|지식|의식|이해|판단|결정|느끼|확인|알아보|비교/,
  /늘어|증가|줄어|감소|변하|바뀌|바꾸|달라|없어|사라|잃어/,
  /신청|예약|취소|접수|마감|준비|개최|실시|회의|문의|기입|등록/,
  /가족|부모|자녀|친구|동료|상대|본인|개인|여성|남성|직원|고객|사람/,
  /회사|기업|직장|사업|경영|근무|출근|퇴근|일하다|일하는|업무|사원/,
  /집|방|공간|본사|장소|실내|건물|행사장|휴게실|책상|책장/,
  /기분|마음|감정|웃|행복|불안|용기|놀라|따뜻|슬프|즐거/,
  /몸|신체|머리|손|얼굴|피부|잠|수면|졸음|호흡|영양|건강/,
  /시간|기간|시기|오늘|내일|어제|이전|이후|동안|순간|때|날짜/,
  /재료|음식|요리|조리|식사|먹|마시|맛|영양|식재료/,
];

function meaningSimilarity(word: Vocabulary, candidate: Vocabulary): number {
  const first = meaningText(word);
  const second = meaningText(candidate);
  const tokenA = meaningTokens(word);
  const tokenB = meaningTokens(candidate);
  const sharedTokens = [...tokenA].filter((token) => tokenB.has(token)).length;
  const sharedFamilies = meaningFamilies.filter(
    (family) => family.test(first) && family.test(second),
  ).length;
  const samePartOfSpeech =
    word.part_of_speech && candidate.part_of_speech &&
    word.part_of_speech === candidate.part_of_speech;

  // Matching both meaning category and expression length is harder to guess
  // than mixing unrelated choices (e.g. a short noun versus a long verb).
  return (
    Math.min(sharedFamilies, 2) * 5 +
    Math.min(sharedTokens, 2) * 4 +
    (samePartOfSpeech ? 2 : 0) +
    editSimilarity(normalizeMeaning(first), normalizeMeaning(second)) * 2 +
    lengthSimilarity(first, second) * 2.5
  );
}

function distractorScore(
  word: Vocabulary,
  candidate: Vocabulary,
  type: QuestionType,
): number {
  const reading = normalizeReading(word.reading);
  const otherReading = normalizeReading(candidate.reading);
  const sharedKanji = word.kanji_ids.some((id) => candidate.kanji_ids.includes(id));
  const writtenLength = lengthSimilarity(word.word, candidate.word);
  const pronunciation = editSimilarity(reading, otherReading);
  const readingLength = lengthSimilarity(reading, otherReading);

  if (type === "reading") {
    return (
      pronunciation * 8 +
      readingLength * 3 +
      writtenLength * 1.5 +
      (sharedKanji ? 1.8 : 0) +
      (reading[0] === otherReading[0] ? 0.7 : 0) +
      meaningSimilarity(word, candidate) * 0.12
    );
  }
  return (
    meaningSimilarity(word, candidate) +
    writtenLength * 1.2 +
    readingLength * 0.7 +
    pronunciation * 0.7 +
    (sharedKanji ? 0.5 : 0)
  );
}

function chooseDistractors(
  word: Vocabulary,
  all: Vocabulary[],
  type: QuestionType,
  answer: string,
): string[] {
  const normalizeAnswer =
    type === "reading" ? normalizeReading : normalizeMeaning;
  const answerKey = normalizeAnswer(answer);
  const wordMeanings = new Set(word.meanings_ko.map(normalizeMeaning));
  const ranked = all
    .filter((candidate) => {
      if (candidate.id === word.id || candidate.word === word.word) return false;
      const label = answerFor(candidate, type);
      if (!label || normalizeAnswer(label) === answerKey) return false;
      // An identical translation must not become an additional valid answer.
      if (
        type === "meaning" &&
        candidate.meanings_ko.some((meaning) =>
          wordMeanings.has(normalizeMeaning(meaning)),
        )
      ) return false;
      return true;
    })
    .map((candidate) => ({
      label: answerFor(candidate, type),
      score: distractorScore(word, candidate, type),
      // Randomize almost-equal candidates without selecting unrelated words.
      tieBreaker: Math.random() * 0.15,
    }))
    .sort((a, b) => (b.score + b.tieBreaker) - (a.score + a.tieBreaker));

  const seen = new Set([answerKey]);
  const choices: string[] = [];
  for (const candidate of ranked) {
    const key = normalizeAnswer(candidate.label);
    if (!key || seen.has(key)) continue;
    choices.push(candidate.label);
    seen.add(key);
    if (choices.length === 3) break;
  }
  return choices;
}

export function createQuiz(
  pool: Vocabulary[],
  all: Vocabulary[],
  mode: Mode,
  limit = 10,
): Question[] {
  const questions: Question[] = [];
  for (const word of shuffle(pool)) {
    if (questions.length >= limit) break;
    const type: QuestionType =
      mode === "mixed"
        ? (questions.length % 2 === 0 ? "reading" : "meaning")
        : mode;
    const answer = answerFor(word, type);
    if (!answer) continue;
    const distractors = chooseDistractors(word, all, type, answer);
    if (distractors.length !== 3) continue;
    questions.push({
      word,
      type,
      answer,
      options: shuffle([answer, ...distractors]),
    });
  }
  return questions;
}

// Review selection is isolated so SRS can replace this policy later.
export function reviewIds(progress: StudyProgress[]): Set<string> {
  return new Set(
    progress
      .filter(
        (p) =>
          p.item_type === "vocabulary" && (p.wrong_count > 0 || p.is_favorite),
      )
      .sort(
        (a, b) =>
          b.wrong_count - a.wrong_count ||
          (b.last_studied_at ?? "").localeCompare(a.last_studied_at ?? ""),
      )
      .map((p) => p.item_id),
  );
}
