import Dexie, { type Table } from "dexie";
import type {
  Backup,
  Dataset,
  ItemType,
  StudyHistory,
  StudyProgress,
  Vocabulary,
  Kanji,
} from "./types";
import { seed } from "./seed";
export class StudyDB extends Dexie {
  kanji!: Table<Kanji, string>;
  vocabulary!: Table<Vocabulary, string>;
  history!: Table<StudyHistory, number>;
  progress!: Table<StudyProgress, [ItemType, string]>;
  constructor(name = "kotoba-n3") {
    super(name);
    this.version(1).stores({
      kanji: "id,&character",
      vocabulary: "id,&word",
      history: "++id,[item_type+item_id],studied_at",
      progress: "[item_type+item_id],item_type,item_id",
    });
    this.on("populate", async () => {
      await this.kanji.bulkAdd(seed.kanji);
      await this.vocabulary.bulkAdd(seed.vocabulary);
    });
  }
}
export const db = new StudyDB();
export const emptyProgress = (
  item_type: ItemType,
  item_id: string,
): StudyProgress => ({
  item_type,
  item_id,
  correct_count: 0,
  wrong_count: 0,
  last_studied_at: null,
  next_review_at: null,
  is_favorite: false,
});
export async function initialize() {
  await db.open();
}
export async function recordAnswer(answer: Omit<StudyHistory, "id">) {
  await db.transaction("rw", db.history, db.progress, async () => {
    await db.history.add(answer);
    const key: [ItemType, string] = [answer.item_type, answer.item_id];
    const p = (await db.progress.get(key)) ?? emptyProgress(...key);
    await db.progress.put({
      ...p,
      correct_count: p.correct_count + Number(answer.is_correct),
      wrong_count: p.wrong_count + Number(!answer.is_correct),
      last_studied_at: answer.studied_at,
      next_review_at: answer.is_correct ? null : answer.studied_at,
    });
  });
}
export async function toggleFavorite(type: ItemType, id: string) {
  await db.transaction("rw", db.progress, async () => {
    const p = (await db.progress.get([type, id])) ?? emptyProgress(type, id);
    await db.progress.put({ ...p, is_favorite: !p.is_favorite });
  });
}
export async function mergeDataset(data: Dataset) {
  return db.transaction("rw", db.kanji, db.vocabulary, async () => {
    let added = 0;
    let updated = 0;
    for (const k of data.kanji) {
      const old = await db.kanji.get(k.id);
      await db.kanji.put(
        old
          ? {
              ...old,
              ...k,
              korean_hun: k.korean_hun || old.korean_hun,
              korean_eum: k.korean_eum || old.korean_eum,
              onyomi: k.onyomi.length ? k.onyomi : old.onyomi,
              kunyomi: k.kunyomi.length ? k.kunyomi : old.kunyomi,
              meanings_ko: k.meanings_ko.length
                ? k.meanings_ko
                : old.meanings_ko,
            }
          : k,
      );
    }
    for (const v of data.vocabulary) {
      const old = await db.vocabulary.get(v.id);
      if (old) updated++;
      else added++;
      await db.vocabulary.put(v);
    }
    return { added, updated };
  });
}
export async function exportBackup(): Promise<Backup> {
  return db.transaction(
    "r",
    db.kanji,
    db.vocabulary,
    db.history,
    db.progress,
    async () => ({
      format: "kotoba-backup",
      version: 1,
      exported_at: new Date().toISOString(),
      kanji: await db.kanji.toArray(),
      vocabulary: await db.vocabulary.toArray(),
      history: await db.history.toArray(),
      progress: await db.progress.toArray(),
    }),
  );
}
// Backup restore intentionally replaces all stores atomically after explicit UI confirmation.
export async function restoreBackup(data: Backup) {
  await db.transaction(
    "rw",
    db.kanji,
    db.vocabulary,
    db.history,
    db.progress,
    async () => {
      await Promise.all([
        db.kanji.clear(),
        db.vocabulary.clear(),
        db.history.clear(),
        db.progress.clear(),
      ]);
      await db.kanji.bulkAdd(data.kanji);
      await db.vocabulary.bulkAdd(data.vocabulary);
      await db.history.bulkAdd(data.history);
      await db.progress.bulkAdd(data.progress);
    },
  );
}
