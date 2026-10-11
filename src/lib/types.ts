export type ItemType = "kanji" | "vocabulary";
export type QuestionType = "reading" | "meaning";
export type Mode = QuestionType | "mixed";
export interface Kanji {
  id: string;
  character: string;
  korean_hun: string;
  korean_eum: string;
  onyomi: string[];
  kunyomi: string[];
  meanings_ko: string[];
  jlpt_level?: string;
  source?: string;
}
export interface Vocabulary {
  id: string;
  word: string;
  reading: string;
  meanings_ko: string[];
  kanji_ids: string[];
  jlpt_level?: string;
  source?: string;
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
