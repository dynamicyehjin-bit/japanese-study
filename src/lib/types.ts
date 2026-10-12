export type ItemType = "kanji" | "vocabulary";
export type QuestionType = "reading" | "meaning";
export type Mode = QuestionType | "mixed";
export interface KoreanReading {
  hun: string;
  eum: string;
}
export interface KanjiMetadataSource {
  label: string;
  url: string;
  field: "japanese_readings" | "korean_huneum" | "character_variant";
  license?: string;
}
export interface Kanji {
  id: string;
  character: string;
  korean_hun: string | null;
  korean_eum: string | null;
  korean_readings?: KoreanReading[];
  korean_reference_character?: string;
  onyomi: string[] | null;
  kunyomi: string[] | null;
  meanings_ko: string[] | null;
  jlpt_level?: string;
  source?: string;
  source_id?: string;
  metadata_status?: string;
  metadata_source?: string | null;
  metadata_sources?: KanjiMetadataSource[];
  metadata_verified_at?: string;
}
export interface Vocabulary {
  id: string;
  word: string;
  reading: string;
  meanings_ko: string[];
  kanji_ids: string[];
  jlpt_level?: string;
  source?: string;
  source_id?: string;
  starred_in_book?: boolean;
  part_of_speech?: string;
  source_meaning_ko?: string;
  source_locations?: { page: number; column: string; section: string }[];
}
export interface StudyHistory {
  id?: number;
  item_type: ItemType;
  item_id: string;
  question_type: QuestionType;
  selected_answer: string;
  is_correct: boolean;
  studied_at: string;
}
export interface StudyProgress {
  item_type: ItemType;
  item_id: string;
  correct_count: number;
  wrong_count: number;
  last_studied_at: string | null;
  next_review_at: string | null;
  is_favorite: boolean;
}
export interface Dataset {
  kanji: Kanji[];
  vocabulary: Vocabulary[];
}
export interface Backup extends Dataset {
  format: "kotoba-backup";
  version: 1;
  exported_at: string;
  history: StudyHistory[];
  progress: StudyProgress[];
}
export interface Question {
  word: Vocabulary;
  type: QuestionType;
  options: string[];
  answer: string;
}

export interface ImportReport {
  added: number;
  updated: number;
  kanji_added: number;
  kanji_updated: number;
  duplicates: number;
  errors: string[];
}
export interface DatasetRegistration {
  key: string;
  registered_at: string;
  report: ImportReport;
}
