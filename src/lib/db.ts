import Dexie, { type Table } from "dexie";
import type {
  Backup,
  Dataset,
  ItemType,
  StudyHistory,
  StudyProgress,
  Vocabulary,
  Kanji,
  ImportReport,
  DatasetRegistration,
} from "./types";
import { seed } from "./seed";
import { parseDataset } from "./import";
import bundledDataset from "../data/hackers-pages-2-4.json";
export class StudyDB extends Dexie {
  metadata!: Table<DatasetRegistration, string>;
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
    this.version(2).stores({ metadata: "key" });
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
export async function initialize(options: { includeBundled?: boolean } = {}) {
  await db.open();
  if (options.includeBundled !== false) await registerBundledDataset();
}
export const bundledKey = `dataset:${bundledDataset.dataset_id}:${bundledDataset.schema_version}`;
export async function registerBundledDataset(): Promise<ImportReport> {
  return db.transaction(
    "rw",
    db.kanji,
    db.vocabulary,
    db.metadata,
    async () => {
      const existing = await db.metadata.get(bundledKey);
      if (existing) return existing.report;
      const report = await mergeRows(parseDataset(bundledDataset));
      await db.metadata.put({
        key: bundledKey,
        registered_at: new Date().toISOString(),
        report,
      });
      return report;
    },
  );
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
const preserveDetails = (
  incoming: string[] | null,
  previous: string[] | null,
) => (incoming?.length ? incoming : previous?.length ? previous : incoming);
async function mergeRows(data: Dataset): Promise<ImportReport> {
  const report: ImportReport = {
    added: 0,
    updated: 0,
    kanji_added: 0,
    kanji_updated: 0,
    duplicates: 0,
    errors: [],
  };
  const links = new Map<string, string>();
  for (const k of data.kanji) {
    const old = await db.kanji.where("character").equals(k.character).first();
    const id = old?.id ?? k.id;
    links.set(k.id, id);
    if (old) {
      report.kanji_updated++;
      report.duplicates++;
    } else report.kanji_added++;
    await db.kanji.put(
      old
        ? {
            ...old,
            ...k,
            id,
            korean_hun: k.korean_hun || old.korean_hun || k.korean_hun,
            korean_eum: k.korean_eum || old.korean_eum || k.korean_eum,
            onyomi: preserveDetails(k.onyomi, old.onyomi),
            kunyomi: preserveDetails(k.kunyomi, old.kunyomi),
            meanings_ko: preserveDetails(k.meanings_ko, old.meanings_ko),
            metadata_source:
              k.metadata_source ?? old.metadata_source ?? k.metadata_source,
            metadata_status:
              old.metadata_status === "verified" &&
              k.metadata_status === "needs_verified_dictionary"
                ? old.metadata_status
                : (k.metadata_status ?? old.metadata_status),
          }
        : k,
    );
  }
  for (const v of data.vocabulary) {
    const old = await db.vocabulary.where("word").equals(v.word).first();
    if (old) {
      report.updated++;
      report.duplicates++;
    } else report.added++;
    const kanji_ids = v.kanji_ids.map((id) => links.get(id) ?? id);
    for (const id of kanji_ids)
      if (!(await db.kanji.get(id)))
        throw new Error(`단어 ${v.word}: 한자 연결 ${id}가 없습니다.`);
    await db.vocabulary.put({ ...old, ...v, id: old?.id ?? v.id, kanji_ids });
  }
  return report;
}
export async function mergeDataset(data: Dataset) {
  return db.transaction(
    "rw",
    db.kanji,
    db.vocabulary,
    db.metadata,
    async () => {
      const report = await mergeRows(data);
      await db.metadata.put({
        key: "last-import",
        registered_at: new Date().toISOString(),
        report,
      });
      return report;
    },
  );
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
