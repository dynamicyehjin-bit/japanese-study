import type {
  Backup,
  Dataset,
  ItemType,
  Kanji,
  StudyHistory,
  StudyProgress,
  Vocabulary,
} from "./types";
import { characters, kanjiId, vocabularyId } from "./seed";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("객체 형식의 데이터가 필요합니다.");
  return value as Record<string, unknown>;
}
function string(value: unknown, field: string, required = true): string {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || (required && !value.trim()))
    throw new Error(`${field}: 비어 있지 않은 문자열이 필요합니다.`);
  return value.trim().normalize("NFC");
}
function strings(value: unknown, field: string, required = false): string[] {
  if (value === undefined && !required) return [];
  if (
    !Array.isArray(value) ||
    value.some((v) => typeof v !== "string" || !v.trim()) ||
    (required && value.length === 0)
  )
    throw new Error(`${field}: 문자열 배열이 필요합니다.`);
  return [...new Set(value.map((v) => String(v).trim().normalize("NFC")))];
}
function optionalMetadata(o: Record<string, unknown>) {
  return {
    ...((o.jlpt_level ?? o.study_level) === undefined
      ? {}
      : { jlpt_level: string(o.jlpt_level ?? o.study_level, "jlpt_level") }),
    ...(o.source === undefined ? {} : { source: string(o.source, "source") }),
    ...(o.source_id === undefined && o.id === undefined
      ? {}
      : { source_id: string(o.source_id ?? o.id, "source_id") }),
  };
}
function unique<T>(rows: T[], key: (v: T) => string, label: string) {
  const keys = rows.map(key);
  if (new Set(keys).size !== keys.length)
    throw new Error(
      `${label}에 중복 항목이 있습니다. 중복을 제거한 뒤 다시 가져오세요.`,
    );
}
export function parseDataset(input: unknown): Dataset {
  const root: Record<string, unknown> = Array.isArray(input)
    ? { vocabulary: input }
    : { ...object(input) };
  if (root.vocabulary === undefined && Array.isArray(root.kanji))
    root.vocabulary = [];
  if (!Array.isArray(root.vocabulary))
    throw new Error("vocabulary 배열 또는 단어 배열이 필요합니다.");
  if (root.kanji !== undefined && !Array.isArray(root.kanji))
    throw new Error("kanji는 배열이어야 합니다.");
  const aliases = new Map<string, string>();
  const kanji: Kanji[] = ((root.kanji as unknown[]) ?? []).map((row, i) => {
    const o = object(row);
    const character = string(o.character, `한자 ${i + 1} character`);
    if (!/^\p{Script=Han}$/u.test(character))
      throw new Error("character는 한자 한 글자여야 합니다.");
    const id = kanjiId(character);
    if (o.id !== undefined) {
      const alias = string(o.id, "id");
      if (aliases.has(alias)) throw new Error(`중복 한자 ID: ${alias}`);
      aliases.set(alias, id);
    }
    aliases.set(id, id);
    return {
      id,
      character,
      korean_hun:
        o.korean_hun === null
          ? null
          : string(o.korean_hun, "korean_hun", false),
      korean_eum:
        o.korean_eum === null
          ? null
          : string(o.korean_eum, "korean_eum", false),
      onyomi: o.onyomi === null ? null : strings(o.onyomi, "onyomi"),
      kunyomi: o.kunyomi === null ? null : strings(o.kunyomi, "kunyomi"),
      meanings_ko:
        o.meanings_ko === null ? null : strings(o.meanings_ko, "meanings_ko"),
      ...optionalMetadata(o),
      ...(o.metadata_status === undefined
        ? {}
        : { metadata_status: string(o.metadata_status, "metadata_status") }),
      ...(o.metadata_source === undefined
        ? {}
        : {
            metadata_source:
              o.metadata_source === null
                ? null
                : string(o.metadata_source, "metadata_source"),
          }),
    };
  });
  const vocabulary: Vocabulary[] = root.vocabulary.map((row, i) => {
    const o = object(row);
    const word = string(o.word, `단어 ${i + 1} word`);
    const reading = string(o.reading, `단어 ${i + 1} reading`);
    const meanings_ko = strings(
      o.meanings_ko,
      `단어 ${i + 1} meanings_ko`,
      true,
    );
    const linkedIds =
      o.kanji_ids === undefined
        ? characters(word).map(kanjiId)
        : strings(o.kanji_ids, "kanji_ids").map((externalId) => {
            const id =
              aliases.get(externalId) ??
              (characters(word).map(kanjiId).includes(externalId)
                ? externalId
                : undefined);
            if (!id)
              throw new Error(
                `단어 ${word}: 연결된 한자 ID ${externalId}를 찾을 수 없습니다.`,
              );
            if (!characters(word).map(kanjiId).includes(id))
              throw new Error(
                `단어 ${word}: 구성 한자와 연결 ID가 일치하지 않습니다.`,
              );
            return id;
          });
    if (
      o.starred_in_book !== undefined &&
      typeof o.starred_in_book !== "boolean"
    )
      throw new Error(`단어 ${word}: starred_in_book은 boolean이어야 합니다.`);
    const locations =
      o.source_locations === undefined
        ? undefined
        : (() => {
            if (!Array.isArray(o.source_locations))
              throw new Error("source_locations는 배열이어야 합니다.");
            return o.source_locations.map((value) => {
              const r = object(value);
              if (
                typeof r.page !== "number" ||
                !Number.isSafeInteger(r.page) ||
                r.page < 1
              )
                throw new Error("page는 양수 정수여야 합니다.");
              return {
                page: r.page,
                column: string(r.column, "column"),
                section: string(r.section, "section"),
              };
            });
          })();
    return {
      id: vocabularyId(word),
      word,
      reading,
      meanings_ko,
      kanji_ids: [...new Set(linkedIds)],
      ...optionalMetadata(o),
      ...(o.starred_in_book === undefined
        ? {}
        : { starred_in_book: o.starred_in_book as boolean }),
      ...(o.part_of_speech === undefined
        ? {}
        : { part_of_speech: string(o.part_of_speech, "part_of_speech") }),
      ...(o.source_meaning_ko === undefined
        ? {}
        : {
            source_meaning_ko: string(o.source_meaning_ko, "source_meaning_ko"),
          }),
      ...(locations === undefined ? {} : { source_locations: locations }),
    };
  });
  unique(vocabulary, (v) => v.word, "단어 데이터");
  unique(kanji, (k) => k.character, "한자 데이터");
  for (const character of new Set(
    vocabulary.flatMap((v) => characters(v.word)),
  ))
    if (!kanji.some((k) => k.character === character))
      kanji.push({
        id: kanjiId(character),
        character,
        korean_hun: "",
        korean_eum: "",
        onyomi: [],
        kunyomi: [],
        meanings_ko: [],
      });
  if (!vocabulary.length && !kanji.length)
    throw new Error("가져올 데이터가 없습니다.");
  const sourceTitle =
    root.source && typeof root.source === "object" && "title" in root.source
      ? string(root.source.title, "source.title")
      : undefined;
  if (sourceTitle)
    for (const item of [...kanji, ...vocabulary]) item.source ??= sourceTitle;
  return { kanji, vocabulary };
}
export function parseCSV(text: string): Dataset {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else field += c;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(field);
      field = "";
      afterQuote = false;
      if (c !== ",") {
        if (c === "\r" && input[i + 1] === "\n") i++;
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
      }
    } else if (c === '"') {
      if (field || afterQuote)
        throw new Error("CSV 따옴표 형식이 올바르지 않습니다.");
      quoted = true;
    } else {
      if (afterQuote)
        throw new Error("CSV 닫는 따옴표 뒤에 잘못된 문자가 있습니다.");
      field += c;
    }
  }
  if (quoted) throw new Error("CSV 따옴표가 닫히지 않았습니다.");
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  const headers = rows.shift()?.map((v) => v.trim());
  if (
    !headers ||
    !["word", "reading", "meanings_ko"].every((h) => headers.includes(h)) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("CSV 헤더는 word,reading,meanings_ko를 포함해야 합니다.");
  return parseDataset(
    rows.map((r, i) => {
      if (r.length !== headers.length)
        throw new Error(`CSV ${i + 2}행의 열 수가 맞지 않습니다.`);
      const o = Object.fromEntries(headers.map((h, j) => [h, r[j]]));
      return {
        ...o,
        meanings_ko: o.meanings_ko.split("|").map((v) => v.trim()),
      };
    }),
  );
}
const date = (v: unknown, label: string, nullable = false): string | null => {
  if (nullable && v === null) return null;
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(v) ||
    !Number.isFinite(Date.parse(v))
  )
    throw new Error(`${label}: 날짜 형식이 올바르지 않습니다.`);
  return v;
};
const count = (v: unknown, label: string): number => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
    throw new Error(`${label}: 0 이상의 정수가 필요합니다.`);
  return v;
};
export function parseBackup(input: unknown): Backup {
  const o = object(input);
  if (o.format !== "kotoba-backup" || o.version !== 1)
    throw new Error("지원하지 않는 백업 형식입니다.");
  const dataset = parseDataset(o);
  const ids = new Map([
    ...dataset.kanji.map((k) => [`kanji:${k.id}`, k.id] as const),
    ...dataset.vocabulary.map((v) => [`vocabulary:${v.id}`, v.id] as const),
  ]);
  // Stable canonical IDs prevent records from becoming detached after imports.
  for (const type of ["kanji", "vocabulary"] as const)
    for (const row of o[type] as unknown[]) {
      const r = object(row);
      if (!ids.has(`${type}:${r.id}`))
        throw new Error("백업의 데이터 ID가 올바르지 않습니다.");
    }
  if (!Array.isArray(o.history) || !Array.isArray(o.progress))
    throw new Error("백업에 history와 progress 배열이 필요합니다.");
  const ref = (
    r: Record<string, unknown>,
  ): { item_type: ItemType; item_id: string } => {
    if (r.item_type !== "kanji" && r.item_type !== "vocabulary")
      throw new Error("item_type이 올바르지 않습니다.");
    if (!ids.has(`${r.item_type}:${r.item_id}`))
      throw new Error("학습 기록에 연결되지 않은 항목이 있습니다.");
    return { item_type: r.item_type, item_id: String(r.item_id) };
  };
  const history: StudyHistory[] = o.history.map((value) => {
    const r = object(value);
    const reference = ref(r);
    if (
      (r.question_type !== "reading" && r.question_type !== "meaning") ||
      typeof r.is_correct !== "boolean"
    )
      throw new Error("퀴즈 기록 형식이 올바르지 않습니다.");
    const id = count(r.id, "history.id");
    if (!id) throw new Error("history.id는 양수여야 합니다.");
    return {
      ...reference,
      id,
      question_type: r.question_type,
      selected_answer: string(r.selected_answer, "selected_answer"),
      is_correct: r.is_correct,
      studied_at: date(r.studied_at, "studied_at")!,
    };
  });
  unique(history, (h) => String(h.id), "학습 기록");
  const progress: StudyProgress[] = o.progress.map((value) => {
    const r = object(value);
    if (typeof r.is_favorite !== "boolean")
      throw new Error("즐겨찾기 형식이 올바르지 않습니다.");
    return {
      ...ref(r),
      correct_count: count(r.correct_count, "correct_count"),
      wrong_count: count(r.wrong_count, "wrong_count"),
      last_studied_at: date(r.last_studied_at, "last_studied_at", true),
      next_review_at: date(r.next_review_at, "next_review_at", true),
      is_favorite: r.is_favorite,
    };
  });
  unique(progress, (p) => `${p.item_type}:${p.item_id}`, "학습 현황");
  for (const p of progress) {
    const records = history.filter(
      (h) => h.item_type === p.item_type && h.item_id === p.item_id,
    );
    if (
      p.correct_count !== records.filter((h) => h.is_correct).length ||
      p.wrong_count !== records.filter((h) => !h.is_correct).length
    )
      throw new Error("학습 현황과 개별 풀이 기록의 횟수가 일치하지 않습니다.");
  }
  for (const h of history)
    if (
      !progress.some(
        (p) => p.item_type === h.item_type && p.item_id === h.item_id,
      )
    )
      throw new Error("학습 기록에 대응하는 학습 현황이 없습니다.");
  return {
    ...dataset,
    format: "kotoba-backup",
    version: 1,
    exported_at: date(o.exported_at, "exported_at")!,
    history,
    progress,
  };
}
