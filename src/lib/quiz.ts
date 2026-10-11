import type { Mode, Question, StudyProgress, Vocabulary } from "./types";
export const shuffle = <T>(items: T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
export function createQuiz(
  pool: Vocabulary[],
  all: Vocabulary[],
  mode: Mode,
  limit = 10,
): Question[] {
  return shuffle(pool)
    .flatMap((word, index) => {
      const type =
        mode === "mixed" ? (index % 2 === 0 ? "reading" : "meaning") : mode;
      const answer =
        type === "reading" ? word.reading : word.meanings_ko.join(", ");
      const alternatives = [
        ...new Set(
          all
            .filter(
              (v) =>
                v.id !== word.id &&
                v.word !== word.word &&
                (type === "reading" ||
                  !v.meanings_ko.some((m) => word.meanings_ko.includes(m))),
            )
            .map((v) =>
              type === "reading" ? v.reading : v.meanings_ko.join(", "),
            ),
        ),
      ].filter((v) => v && v !== answer);
      if (!answer || alternatives.length < 3) return [];
      return [
        {
          word,
          type,
          answer,
          options: shuffle([answer, ...shuffle(alternatives).slice(0, 3)]),
        },
      ];
    })
    .slice(0, limit);
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
