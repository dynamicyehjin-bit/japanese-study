import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  CircleCheck,
  Flame,
  Home,
  Leaf,
  Library,
  RefreshCw,
  Settings2,
  Sparkles,
  Star,
  Target,
  Upload,
  Download,
  X,
  WifiOff,
  Sprout,
  Trophy,
  CheckCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  db,
  initialize,
  recordAnswer,
  toggleFavorite,
  mergeDataset,
  exportBackup,
  restoreBackup,
} from "./lib/db";
import { createQuiz, reviewIds } from "./lib/quiz";
import { parseBackup, parseCSV, parseDataset } from "./lib/import";
import type {
  Backup,
  Kanji,
  Mode,
  Question,
  StudyProgress,
  Vocabulary,
} from "./lib/types";

type Page = "home" | "study" | "wrong" | "favorites" | "data";
type Session = {
  questions: Question[];
  index: number;
  results: { question: Question; correct: boolean }[];
};
const modes: { id: Mode; label: string; caption: string }[] = [
  { id: "mixed", label: "혼합 퀴즈", caption: "읽기와 의미를 함께" },
  { id: "reading", label: "읽기 퀴즈", caption: "히라가나 읽기 연습" },
  { id: "meaning", label: "의미 퀴즈", caption: "한국어 뜻 떠올리기" },
];
const nav: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "홈", icon: Home },
  { id: "study", label: "단어장", icon: BookOpen },
  { id: "wrong", label: "오답노트", icon: RefreshCw },
  { id: "favorites", label: "즐겨찾기", icon: Star },
  { id: "data", label: "데이터 관리", icon: Settings2 },
];
const localDay = (value: string | Date) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
      })
    : "학습 전";
function Garden() {
  return (
    <svg className="garden" viewBox="0 0 320 250" aria-hidden="true">
      <ellipse cx="165" cy="222" rx="112" ry="14" fill="#d8e7cb" />
      <circle cx="168" cy="119" r="96" fill="#e5edce" />
      <path
        d="M156 197Q156 133 161 83"
        fill="none"
        stroke="#407856"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path d="M158 154Q101 155 94 107q55-6 64 47" fill="#7aaa69" />
      <path d="M160 126q59-3 72-57-55-8-72 57" fill="#4e8962" />
      <path d="M159 101q-36-24-22-64 47 17 22 64" fill="#98b969" />
      <path
        d="M158 151l-43-28m47-2 46-29m-49 9-12-36"
        stroke="#e7edbe"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M121 185h81l-10 38h-59z" fill="#ddaa7d" />
      <path d="M120 185h82v11h-82z" fill="#efc39b" />
      <rect
        x="206"
        y="136"
        width="59"
        height="66"
        rx="11"
        transform="rotate(12 206 136)"
        fill="#fffdf1"
        stroke="#c9d5b8"
        strokeWidth="2"
      />
      <text
        x="230"
        y="178"
        fontSize="32"
        fill="#32684d"
        transform="rotate(12 230 178)"
      >
        学
      </text>
      <path d="m67 72 4-10 4 10 10 4-10 4-4 10-4-10-10-4z" fill="#e8b65e" />
      <circle cx="258" cy="51" r="5" fill="#b1c67d" />
      <path d="m266 109 3-7 3 7 7 3-7 3-3 7-3-7-7-3z" fill="#e8b65e" />
    </svg>
  );
}
function StarButton({
  active,
  onClick,
  label = "즐겨찾기",
}: {
  active: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      className={`icon-button favorite ${active ? "active" : ""}`}
      aria-label={active ? `${label} 해제` : `${label} 추가`}
      aria-pressed={active}
      onClick={onClick}
    >
      <Star size={20} fill={active ? "currentColor" : "none"} />
    </button>
  );
}
function App() {
  const [page, setPage] = useState<Page>("home");
  const [mode, setMode] = useState<Mode>("mixed");
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [fatal, setFatal] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [detail, setDetail] = useState<Vocabulary | Kanji | null>(null);
  const [search, setSearch] = useState("");
  const [studyTab, setStudyTab] = useState<"vocabulary" | "kanji">(
    "vocabulary",
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [clock, setClock] = useState(new Date());
  const vocabulary = useLiveQuery(() => db.vocabulary.toArray(), []) ?? [];
  const kanji = useLiveQuery(() => db.kanji.toArray(), []) ?? [];
  const history = useLiveQuery(() => db.history.toArray(), []) ?? [];
  const progress = useLiveQuery(() => db.progress.toArray(), []) ?? [];
  useEffect(() => {
    initialize()
      .then(() => setReady(true))
      .catch(() =>
        setFatal(
          "로컬 저장소를 열 수 없습니다. 브라우저의 저장 공간과 개인정보 보호 설정을 확인한 뒤 새로고침하세요.",
        ),
      );
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const timer = window.setInterval(() => setClock(new Date()), 60000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (session && session.index < session.questions.length) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [session]);
  const pFor = (type: "kanji" | "vocabulary", id: string) =>
    progress.find((p) => p.item_type === type && p.item_id === id);
  const favorite = (type: "kanji" | "vocabulary", id: string) => {
    toggleFavorite(type, id).catch(() =>
      setNotice("즐겨찾기를 저장하지 못했습니다. 저장 공간을 확인해주세요."),
    );
  };
  const today = history.filter(
    (h) => localDay(h.studied_at) === localDay(clock),
  );
  const todayCorrect = today.filter((h) => h.is_correct).length;
  const rate = today.length
    ? Math.round((todayCorrect / today.length) * 100)
    : 0;
  const wrongWords = vocabulary
    .filter((v) => (pFor("vocabulary", v.id)?.wrong_count ?? 0) > 0)
    .sort(
      (a, b) =>
        (pFor("vocabulary", b.id)?.wrong_count ?? 0) -
        (pFor("vocabulary", a.id)?.wrong_count ?? 0),
    );
  const reviewWords = vocabulary.filter((v) => reviewIds(progress).has(v.id));
  const favoriteWords = vocabulary.filter(
    (v) => pFor("vocabulary", v.id)?.is_favorite,
  );
  const favoriteKanji = kanji.filter((k) => pFor("kanji", k.id)?.is_favorite);
  const learned = progress.filter(
    (p) => p.item_type === "vocabulary" && p.correct_count + p.wrong_count > 0,
  ).length;
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(clock);
    day.setDate(day.getDate() - 6 + i);
    return {
      day,
      label: ["일", "월", "화", "수", "목", "금", "토"][day.getDay()],
      count: history.filter((h) => localDay(h.studied_at) === localDay(day))
        .length,
    };
  });
  const start = (pool: Vocabulary[] = vocabulary) => {
    const questions = createQuiz(pool, vocabulary, mode);
    if (!questions.length) {
      setNotice(
        "퀴즈에는 서로 다른 유효한 선택지 4개가 필요합니다. 단어 데이터를 추가해주세요.",
      );
      return;
    }
    setSession({ questions, index: 0, results: [] });
    setSelected("");
    setFeedback(null);
    setDetail(null);
    window.scrollTo(0, 0);
  };
  const leave = () => {
    if (
      session &&
      session.index < session.questions.length &&
      !window.confirm("학습을 종료할까요? 이미 확인한 풀이 기록은 저장됩니다.")
    )
      return;
    setSession(null);
    setFeedback(null);
    setSelected("");
  };
  const submit = async () => {
    if (!session || !selected || feedback !== null || saving.current) return;
    saving.current = true;
    setBusy(true);
    const question = session.questions[session.index];
    const correct = selected === question.answer;
    try {
      await recordAnswer({
        item_type: "vocabulary",
        item_id: question.word.id,
        question_type: question.type,
        selected_answer: selected,
        is_correct: correct,
        studied_at: new Date().toISOString(),
      });
      setFeedback(correct);
      setSession((s) =>
        s ? { ...s, results: [...s.results, { question, correct }] } : s,
      );
    } catch {
      setNotice(
        "풀이 기록을 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해주세요.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const next = () => {
    setSession((s) => (s ? { ...s, index: s.index + 1 } : s));
    setSelected("");
    setFeedback(null);
    window.scrollTo(0, 0);
  };
  const navigate = (target: Page) => {
    setPage(target);
    setSearch("");
    window.scrollTo(0, 0);
  };
  const wordCard = (v: Vocabulary) => (
    <article className="word-card" key={v.id}>
      <button className="word-main" onClick={() => setDetail(v)}>
        <span className="word-jp" lang="ja">
          {v.word}
        </span>
        <span className="word-reading" lang="ja">
          {v.reading}
        </span>
        <span className="word-meaning">{v.meanings_ko.join(", ")}</span>
      </button>
      <StarButton
        active={!!pFor("vocabulary", v.id)?.is_favorite}
        onClick={() => favorite("vocabulary", v.id)}
      />
      <div className="word-meta">
        {page === "wrong" ? (
          <>
            <span className="wrong-tag">
              오답 {pFor("vocabulary", v.id)?.wrong_count}회
            </span>
            <span>
              최근 오답{" "}
              {dateLabel(
                history
                  .filter((h) => h.item_id === v.id && !h.is_correct)
                  .sort((a, b) => b.studied_at.localeCompare(a.studied_at))[0]
                  ?.studied_at ?? null,
              )}
            </span>
          </>
        ) : (
          <>
            <span>
              {pFor("vocabulary", v.id)?.last_studied_at
                ? "학습 " +
                  ((pFor("vocabulary", v.id)?.correct_count ?? 0) +
                    (pFor("vocabulary", v.id)?.wrong_count ?? 0)) +
                  "회"
                : "아직 만나지 않은 단어"}
            </span>
            <ChevronRight size={15} />
          </>
        )}
      </div>
    </article>
  );
  const kanjiCard = (k: Kanji) => (
    <article className="word-card kanji-card" key={k.id}>
      <button className="word-main" onClick={() => setDetail(k)}>
        <span className="word-jp" lang="ja">
          {k.character}
        </span>
        <span className="word-meaning">
          {k.korean_hun ? `${k.korean_hun} ${k.korean_eum}` : "훈·음 미등록"}
        </span>
        <span className="word-reading">
          {k.meanings_ko?.join(", ") || "상세 정보를 추가할 수 있어요"}
        </span>
      </button>
      <StarButton
        active={!!pFor("kanji", k.id)?.is_favorite}
        onClick={() => favorite("kanji", k.id)}
      />
    </article>
  );
  if (fatal)
    return (
      <main className="error-page">
        <WifiOff />
        <h1>저장소를 확인해주세요</h1>
        <p>{fatal}</p>
        <button className="primary" onClick={() => location.reload()}>
          다시 시도
        </button>
      </main>
    );
  if (!ready)
    return (
      <main className="error-page">
        <Sprout size={40} />
        <p>나의 학습 공간을 준비하고 있어요…</p>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (session) leave();
            else navigate("home");
          }}
        >
          <span className="brand-symbol">
            <BookOpen size={23} />
            <Leaf size={12} />
          </span>
          <span>
            코토바<small>나의 작은 일본어 습관</small>
          </span>
        </a>
        <div className="course-badge">
          <span>日本語</span>
          <div>
            JLPT N3<small>한자 · 어휘 학습</small>
          </div>
          <span className="badge-dot" />
        </div>
        <nav aria-label="주 메뉴">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id && !session ? "selected" : ""}`}
              onClick={() => {
                if (session) {
                  if (
                    !window.confirm(
                      "학습을 종료하고 이동할까요? 확인한 기록은 저장됩니다.",
                    )
                  )
                    return;
                  setSession(null);
                }
                navigate(id);
              }}
            >
              <Icon size={21} />
              {label}
              {id === "wrong" && wrongWords.length > 0 && (
                <span className="nav-count">{wrongWords.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Sprout size={28} />
          <strong>작은 공부가 큰 변화를.</strong>
          <p>
            하루 10문제,
            <br />
            나만의 속도로 자라나요.
          </p>
        </div>
        <div className="local-label">
          <span className="badge-dot" />내 기기에 안전하게 저장
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="mobile-brand">
            <BookOpen size={21} /> 코토바
          </span>
          <span className="breadcrumb">
            나의 학습 공간 <ChevronRight size={14} />{" "}
            {session ? "퀴즈" : nav.find((n) => n.id === page)?.label}
          </span>
          <div className="topbar-right">
            {!online && (
              <span className="offline">
                <WifiOff size={15} />
                오프라인
              </span>
            )}
            <span className="daily-chip">
              <Flame size={17} /> 오늘 {today.length}문제
            </span>
            <span className="avatar" aria-label="개인 학습 공간">
              나
            </span>
          </div>
        </header>
        <main className={session ? "content quiz-content" : "content"}>
          {session ? (
            session.index >= session.questions.length ? (
              <section className="result">
                <div className="result-icon">
                  <Trophy size={44} />
                </div>
                <span className="eyebrow">SESSION COMPLETE</span>
                <h1>오늘도 한 걸음 성장했어요!</h1>
                <p>작은 노력이 차곡차곡 쌓이고 있어요.</p>
                <div className="result-stats">
                  <div>
                    <strong>{session.questions.length}</strong>
                    <span>총 문제</span>
                  </div>
                  <div>
                    <strong>
                      {session.results.filter((r) => r.correct).length}
                    </strong>
                    <span>정답</span>
                  </div>
                  <div>
                    <strong>
                      {session.results.filter((r) => !r.correct).length}
                    </strong>
                    <span>오답</span>
                  </div>
                  <div>
                    <strong>
                      {Math.round(
                        (session.results.filter((r) => r.correct).length /
                          session.questions.length) *
                          100,
                      )}
                      %
                    </strong>
                    <span>정답률</span>
                  </div>
                </div>
                <h2>다시 만나볼 단어</h2>
                {session.results.filter((r) => !r.correct).length ? (
                  <div className="word-grid">
                    {session.results
                      .filter((r) => !r.correct)
                      .map((r) => wordCard(r.question.word))}
                  </div>
                ) : (
                  <div className="empty">
                    <CheckCheck />
                    모든 문제를 맞혔어요. 잘 기억해두세요!
                  </div>
                )}
                <div className="result-actions">
                  {session.results.some((r) => !r.correct) && (
                    <button
                      className="primary"
                      onClick={() =>
                        start(
                          session.results
                            .filter((r) => !r.correct)
                            .map((r) => r.question.word),
                        )
                      }
                    >
                      <RefreshCw size={18} />
                      오답 다시 풀기
                    </button>
                  )}
                  <button
                    className="secondary"
                    onClick={() => {
                      setSession(null);
                      navigate("home");
                    }}
                  >
                    홈으로 돌아가기
                  </button>
                </div>
              </section>
            ) : (
              (() => {
                const q = session.questions[session.index];
                return (
                  <section className="quiz">
                    <div className="quiz-top">
                      <button
                        className="icon-button"
                        onClick={leave}
                        aria-label="학습 종료"
                      >
                        <X />
                      </button>
                      <div className="progress-track">
                        <span
                          style={{
                            width: `${(session.index / session.questions.length) * 100}%`,
                          }}
                        />
                      </div>
                      <span>
                        {session.index + 1} / {session.questions.length}
                      </span>
                    </div>
                    <div className="quiz-heading">
                      <span className="eyebrow">
                        {q.type === "reading" ? "READING" : "MEANING"} PRACTICE
                      </span>
                      <h1>
                        {q.type === "reading"
                          ? "이 단어는 어떻게 읽을까요?"
                          : "이 단어의 의미는 무엇일까요?"}
                      </h1>
                      <p>알맞은 답을 하나 골라주세요.</p>
                    </div>
                    <div className="question-word">
                      <span lang="ja">{q.word.word}</span>
                      <StarButton
                        active={!!pFor("vocabulary", q.word.id)?.is_favorite}
                        onClick={() => favorite("vocabulary", q.word.id)}
                      />
                    </div>
                    <div
                      className="options"
                      role="group"
                      aria-label="답 선택지"
                    >
                      {q.options.map((o, i) => (
                        <button
                          key={o}
                          disabled={feedback !== null || busy}
                          className={`option ${selected === o ? "chosen" : ""} ${feedback !== null && o === q.answer ? "correct" : ""} ${feedback === false && selected === o ? "incorrect" : ""}`}
                          onClick={() => setSelected(o)}
                          aria-pressed={selected === o}
                        >
                          <span className="option-number">{i + 1}</span>
                          <span lang={q.type === "reading" ? "ja" : "ko"}>
                            {o}
                          </span>
                          {feedback !== null && o === q.answer && (
                            <Check size={20} />
                          )}
                        </button>
                      ))}
                    </div>
                    {feedback !== null && (
                      <div
                        className={`feedback ${feedback ? "success" : "failure"}`}
                        role="status"
                      >
                        <span className="feedback-icon">
                          {feedback ? <Check /> : <X />}
                        </span>
                        <div>
                          <strong>
                            {feedback
                              ? "정답이에요! 잘했어요."
                              : "괜찮아요, 함께 기억해봐요."}
                          </strong>
                          <p>
                            <b lang="ja">
                              {q.word.word} · {q.word.reading}
                            </b>
                            <br />
                            {q.word.meanings_ko.join(", ")}
                          </p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setDetail(q.word)}
                        >
                          단어 보기 <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                    <div className="quiz-footer">
                      {feedback === null ? (
                        <button
                          className="primary"
                          disabled={!selected || busy}
                          onClick={submit}
                        >
                          {busy ? "기록 저장 중…" : "정답 확인"}
                          <Check size={18} />
                        </button>
                      ) : (
                        <button className="primary" onClick={next}>
                          {session.index === session.questions.length - 1
                            ? "결과 보기"
                            : "다음 문제"}
                          <ArrowRight size={18} />
                        </button>
                      )}
                      <span>풀이 기록은 확인할 때마다 자동으로 저장돼요.</span>
                    </div>
                  </section>
                );
              })()
            )
          ) : (
            <>
              {page === "home" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">A LITTLE EVERY DAY</span>
                      <h1>
                        오늘도, 한 단어씩{" "}
                        <span className="heading-sprout">🌱</span>
                      </h1>
                      <p>
                        서두르지 않아도 괜찮아요. 일본어와 조금 더 가까워져요.
                      </p>
                    </div>
                    <span className="date-label">
                      {clock.toLocaleDateString("ko-KR", {
                        month: "long",
                        day: "numeric",
                        weekday: "long",
                      })}
                    </span>
                  </div>
                  <div className="home-grid">
                    <div className="home-main">
                      <section className="hero-card">
                        <div className="hero-copy">
                          <span className="pill">
                            <Sparkles size={14} /> 나를 위한 작은 도전
                          </span>
                          <h2>
                            차곡차곡 쌓는
                            <br />
                            <em>일본어 자신감.</em>
                          </h2>
                          <p>
                            한자는 읽고, 단어는 이해하고.
                            <br />
                            오늘의 학습을 시작해볼까요?
                          </p>
                          <button className="primary" onClick={() => start()}>
                            학습 시작하기 <ArrowRight size={18} />
                          </button>
                          <span className="hero-foot">
                            {Math.min(10, vocabulary.length)}문제 ·{" "}
                            {mode === "mixed"
                              ? "읽기 + 의미"
                              : mode === "reading"
                                ? "읽기"
                                : "의미"}{" "}
                            · 나의 속도로
                          </span>
                        </div>
                        <Garden />
                      </section>
                      <section
                        className="stat-grid"
                        aria-label="오늘의 학습 현황"
                      >
                        <div className="stat-card">
                          <span className="stat-icon green">
                            <BookOpen size={21} />
                          </span>
                          <span>오늘 학습한 문제</span>
                          <strong>
                            {today.length}
                            <small>문제</small>
                          </strong>
                          <div className="mini-progress">
                            <span
                              style={{
                                width: `${Math.min((today.length / 10) * 100, 100)}%`,
                              }}
                            />
                          </div>
                          <small>하루 목표 10문제</small>
                        </div>
                        <div className="stat-card">
                          <span className="stat-icon gold">
                            <Target size={22} />
                          </span>
                          <span>오늘의 정답률</span>
                          <strong>
                            {rate}
                            <small>%</small>
                          </strong>
                          <small>
                            {today.length
                              ? `${today.length}문제 중 ${todayCorrect}문제 정답`
                              : "첫 문제를 풀어보세요"}
                          </small>
                        </div>
                        <button
                          className="stat-card stat-button"
                          onClick={() =>
                            reviewWords.length
                              ? start(reviewWords)
                              : navigate("wrong")
                          }
                        >
                          <span className="stat-icon coral">
                            <RefreshCw size={21} />
                          </span>
                          <span>복습할 단어</span>
                          <strong>
                            {reviewWords.length}
                            <small>단어</small>
                          </strong>
                          <small>
                            오답과 즐겨찾기를 다시 만나요{" "}
                            <ChevronRight size={12} />
                          </small>
                        </button>
                      </section>
                      <section className="practice-section">
                        <div className="section-heading">
                          <h2>어떻게 공부할까요?</h2>
                          <span>오늘의 학습 모드</span>
                        </div>
                        <div className="mode-grid">
                          {modes.map((m, i) => (
                            <button
                              className={`mode-card ${mode === m.id ? "active" : ""}`}
                              key={m.id}
                              onClick={() => setMode(m.id)}
                              aria-pressed={mode === m.id}
                            >
                              <span className="mode-symbol">
                                {["あ / 뜻", "あ", "뜻"][i]}
                              </span>
                              <strong>{m.label}</strong>
                              <small>{m.caption}</small>
                              <span className="mode-radio">
                                {mode === m.id && <Check size={12} />}
                              </span>
                            </button>
                          ))}
                        </div>
                        <button
                          className="text-button mode-start"
                          onClick={() => start()}
                        >
                          {modes.find((m) => m.id === mode)?.label} 시작{" "}
                          <ArrowRight size={16} />
                        </button>
                      </section>
                      <section className="discover">
                        <div className="section-heading">
                          <h2>오늘 만나볼 단어</h2>
                          <button
                            className="text-button"
                            onClick={() => navigate("study")}
                          >
                            단어장 전체 보기 <ArrowRight size={15} />
                          </button>
                        </div>
                        <div className="word-grid">
                          {vocabulary.slice(0, 3).map(wordCard)}
                        </div>
                      </section>
                    </div>
                    <aside className="home-side">
                      <section className="weekly-card">
                        <div className="section-heading">
                          <h2>나의 학습 발자국</h2>
                          <Leaf size={19} />
                        </div>
                        <p>조금씩, 꾸준히 이어가요.</p>
                        <div className="week-chart">
                          {week.map((d, i) => (
                            <div key={i}>
                              <span
                                className={`day-marker ${d.count ? "done" : ""} ${i === 6 ? "today" : ""}`}
                              >
                                {d.count ? <Check size={17} /> : <span />}
                              </span>
                              <small>{d.label}</small>
                            </div>
                          ))}
                        </div>
                        <div className="weekly-total">
                          <span>최근 7일 학습</span>
                          <strong>
                            {week.reduce((sum, d) => sum + d.count, 0)}
                            <small> 문제</small>
                          </strong>
                        </div>
                      </section>
                      <section className="collection-card">
                        <div className="collection-icon">
                          <Library size={25} />
                        </div>
                        <h2>나의 단어 정원</h2>
                        <p>알게 된 단어만큼 자라나요.</p>
                        <div className="collection-count">
                          <strong>{learned}</strong>
                          <span>/ {vocabulary.length} 단어</span>
                        </div>
                        <div className="progress-track">
                          <span
                            style={{
                              width: `${vocabulary.length ? (learned / vocabulary.length) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("study")}
                        >
                          단어 둘러보기 <ArrowRight size={15} />
                        </button>
                      </section>
                      <button
                        className="shortcut"
                        onClick={() => navigate("wrong")}
                      >
                        <span className="stat-icon coral">
                          <RefreshCw size={20} />
                        </span>
                        <div>
                          <strong>오답노트</strong>
                          <small>헷갈린 단어, 다시 한번</small>
                        </div>
                        <ChevronRight size={18} />
                      </button>
                      <button
                        className="shortcut"
                        onClick={() => navigate("favorites")}
                      >
                        <span className="stat-icon gold">
                          <Star size={20} />
                        </span>
                        <div>
                          <strong>즐겨찾기</strong>
                          <small>꼭 기억하고 싶은 단어</small>
                        </div>
                        <ChevronRight size={18} />
                      </button>
                      <div className="gentle-note">
                        <Leaf size={18} />
                        <p>
                          완벽함보다 꾸준함.
                          <br />
                          오늘의 한 문제도 소중해요.
                        </p>
                      </div>
                    </aside>
                  </div>
                </>
              )}
              {(page === "study" ||
                page === "wrong" ||
                page === "favorites") && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        {page === "study"
                          ? "MY WORD GARDEN"
                          : page === "wrong"
                            ? "GROW THROUGH PRACTICE"
                            : "MY COLLECTION"}
                      </span>
                      <h1>
                        {page === "study"
                          ? "나의 단어장"
                          : page === "wrong"
                            ? "다시 만나면 더 쉬워져요"
                            : "꼭 기억하고 싶은 단어"}
                      </h1>
                      <p>
                        {page === "study"
                          ? "단어를 살펴보고, 구성 한자까지 하나씩 알아보세요."
                          : page === "wrong"
                            ? "틀린 횟수와 풀이 기록을 보며 차근차근 복습해요."
                            : "단어와 한자를 별표로 모아두세요."}
                      </p>
                    </div>
                    {page !== "study" && (
                      <button
                        className="primary"
                        disabled={
                          !(page === "wrong" ? wrongWords : favoriteWords)
                            .length
                        }
                        onClick={() =>
                          start(page === "wrong" ? wrongWords : favoriteWords)
                        }
                      >
                        <RefreshCw size={17} />
                        {page === "wrong"
                          ? "오답 단어 복습"
                          : "즐겨찾기 단어 퀴즈"}
                      </button>
                    )}
                  </div>
                  <div className="list-toolbar">
                    <div className="segmented">
                      <button
                        className={studyTab === "vocabulary" ? "active" : ""}
                        onClick={() => setStudyTab("vocabulary")}
                      >
                        단어{" "}
                        {page === "study"
                          ? vocabulary.length
                          : page === "wrong"
                            ? wrongWords.length
                            : favoriteWords.length}
                      </button>
                      {page !== "wrong" && (
                        <button
                          className={studyTab === "kanji" ? "active" : ""}
                          onClick={() => setStudyTab("kanji")}
                        >
                          한자{" "}
                          {page === "favorites"
                            ? favoriteKanji.length
                            : kanji.length}
                        </button>
                      )}
                    </div>
                    <input
                      aria-label="단어 검색"
                      className="search"
                      placeholder="단어, 읽기, 뜻 검색"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  {page === "study" && studyTab === "kanji" && (
                    <div className="info-note">
                      한자 훈·음과 음독·훈독은 사전 등재 정보를 표시합니다.
                      훈독이 사전에 등재되지 않은 항목은 임의로 채우지 않습니다.
                    </div>
                  )}
                  <div className="word-grid library-grid">
                    {studyTab === "kanji" && page !== "wrong"
                      ? (page === "favorites" ? favoriteKanji : kanji)
                          .filter((k) =>
                            `${k.character}${k.korean_hun}${k.korean_eum}${k.meanings_ko?.join("")}`.includes(
                              search,
                            ),
                          )
                          .map(kanjiCard)
                      : (page === "wrong"
                          ? wrongWords
                          : page === "favorites"
                            ? favoriteWords
                            : vocabulary
                        )
                          .filter((v) =>
                            `${v.word}${v.reading}${v.meanings_ko.join("")}`.includes(
                              search,
                            ),
                          )
                          .map(wordCard)}
                  </div>
                  {(page === "wrong"
                    ? wrongWords
                    : page === "favorites"
                      ? studyTab === "kanji"
                        ? favoriteKanji
                        : favoriteWords
                      : studyTab === "kanji"
                        ? kanji
                        : vocabulary
                  ).filter((v) => JSON.stringify(v).includes(search)).length ===
                    0 && (
                    <div className="empty">
                      <Sprout size={36} />
                      <h2>
                        {search
                          ? "검색 결과가 없어요"
                          : page === "wrong"
                            ? "아직 틀린 단어가 없어요"
                            : "아직 모아둔 항목이 없어요"}
                      </h2>
                      <p>
                        {page === "wrong"
                          ? "퀴즈를 풀면 헷갈린 단어가 여기에 모여요."
                          : "단어장의 별표를 눌러 나만의 모음을 만들어보세요."}
                      </p>
                    </div>
                  )}
                  {page === "wrong" && wrongWords.length > 0 && (
                    <div className="info-note">
                      같은 단어는 한 번만 표시되며, 모든 개별 풀이 기록은
                      유지됩니다. 정답을 맞힌 뒤에도 누적 오답노트에서 확인할 수
                      있어요.
                    </div>
                  )}
                </>
              )}
              {page === "data" && (
                <DataPanel
                  onNotice={setNotice}
                  counts={{
                    vocabulary: vocabulary.length,
                    kanji: kanji.length,
                    history: history.length,
                  }}
                />
              )}
              <footer className="page-footer">
                <span>코토바 · 매일 조금씩, 나의 속도로</span>
                <span>
                  <CircleCheck size={13} /> 학습 기록 자동 저장
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {!session && (
        <nav className="mobile-nav" aria-label="모바일 메뉴">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={21} />
              <span>{id === "data" ? "데이터" : label}</span>
            </button>
          ))}
        </nav>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="알림 닫기" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {detail && (
        <DetailModal
          item={detail}
          kanji={kanji}
          vocabulary={vocabulary}
          progress={progress}
          onSelect={setDetail}
          onClose={() => setDetail(null)}
          onFavorite={favorite}
        />
      )}
    </div>
  );
}
function DetailModal({
  item,
  kanji,
  vocabulary,
  progress,
  onSelect,
  onClose,
  onFavorite,
}: {
  item: Vocabulary | Kanji;
  kanji: Kanji[];
  vocabulary: Vocabulary[];
  progress: StudyProgress[];
  onSelect: (v: Vocabulary | Kanji) => void;
  onClose: () => void;
  onFavorite: (type: "kanji" | "vocabulary", id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const isWord = "word" in item;
  const type = isWord ? "vocabulary" : "kanji";
  const p = progress.find((p) => p.item_type === type && p.item_id === item.id);
  return (
    <dialog
      ref={ref}
      className="detail-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-top">
        <span className="eyebrow">{isWord ? "VOCABULARY" : "KANJI"} CARD</span>
        <button
          className="icon-button"
          aria-label="상세 닫기"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <div className="detail-title">
        <h1 lang="ja">{isWord ? item.word : item.character}</h1>
        <StarButton
          active={!!p?.is_favorite}
          onClick={() => onFavorite(type, item.id)}
        />
      </div>
      {isWord ? (
        <>
          <p className="detail-reading" lang="ja">
            {item.reading}
          </p>
          <p className="detail-meaning">{item.meanings_ko?.join(", ")}</p>
          {item.starred_in_book && (
            <p className="info-note">
              ★ 교재 별표 단어 · 사용자 즐겨찾기와 별도로 관리됩니다.
            </p>
          )}
          <h2>이 단어의 한자</h2>
          <p className="muted">한 글자를 눌러 상세 정보를 살펴보세요.</p>
          <div className="kanji-pills">
            {item.kanji_ids.map((id) => {
              const k = kanji.find((k) => k.id === id);
              return k ? (
                <button key={id} lang="ja" onClick={() => onSelect(k)}>
                  {k.character}
                  <ChevronRight size={14} />
                </button>
              ) : null;
            })}
          </div>
          <div className="detail-progress">
            <span>
              누적 학습{" "}
              <b>{(p?.correct_count ?? 0) + (p?.wrong_count ?? 0)}회</b>
            </span>
            <span>
              정답 <b>{p?.correct_count ?? 0}</b> · 오답{" "}
              <b>{p?.wrong_count ?? 0}</b>
            </span>
            <span>
              마지막 학습 <b>{dateLabel(p?.last_studied_at ?? null)}</b>
            </span>
          </div>
        </>
      ) : (
        <>
          <dl className="kanji-info">
            <div>
              <dt>한국 한자 훈·음</dt>
              <dd>
                {item.korean_readings?.some(
                  (p) => p.hun === item.korean_hun && p.eum === item.korean_eum,
                )
                  ? item.korean_readings
                      .map((p) => `${p.hun} ${p.eum}`)
                      .join(" · ")
                  : [item.korean_hun, item.korean_eum]
                      .filter(Boolean)
                      .join(" ") || "미등록"}
              </dd>
            </div>
            <div>
              <dt>음독</dt>
              <dd lang="ja">
                {item.onyomi?.join(" · ") ||
                  (item.onyomi !== null &&
                  item.metadata_sources?.some(
                    (s) => s.field === "japanese_readings",
                  )
                    ? "사전 등재 없음"
                    : "미등록")}
              </dd>
            </div>
            <div>
              <dt>훈독</dt>
              <dd lang="ja">
                {item.kunyomi?.join(" · ") ||
                  (item.kunyomi !== null &&
                  item.metadata_sources?.some(
                    (s) => s.field === "japanese_readings",
                  )
                    ? "사전 등재 없음"
                    : "미등록")}
              </dd>
            </div>
            <div>
              <dt>한국어 의미</dt>
              <dd>{item.meanings_ko?.join(", ") || "미등록"}</dd>
            </div>
          </dl>
          {item.korean_reference_character &&
            item.korean_reference_character !== item.character && (
              <p className="muted">
                한국 한자 대응 글자:{" "}
                <span lang="ko">{item.korean_reference_character}</span> ·
                신·구자체 대응표 기준
              </p>
            )}
          {item.metadata_sources?.some(
            (s) => s.field === "japanese_readings",
          ) && (
            <p className="muted">
              훈독의 점(.) 뒤는 오쿠리가나, 하이픈(-)은 접사형 표기입니다. 인명
              독음은 포함하지 않습니다.
            </p>
          )}
          <h2>이 한자가 쓰인 단어</h2>
          <div className="related-words">
            {vocabulary
              .filter((v) => v.kanji_ids.includes(item.id))
              .map((v) => (
                <button key={v.id} onClick={() => onSelect(v)}>
                  <b lang="ja">{v.word}</b>
                  <span lang="ja">{v.reading}</span>
                  <span>{v.meanings_ko.join(", ")}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
          </div>
        </>
      )}
      {item.source && (
        <p className="source">
          {!isWord && item.metadata_sources?.length
            ? "단어 연결 원자료: "
            : "출처: "}
          {item.source === "사용자 제공 단어의 구성 한자 · 상세 정보 미등록" &&
          !isWord &&
          item.metadata_sources?.length
            ? "사용자 제공 예시 단어"
            : item.source}
        </p>
      )}
      {!isWord && item.metadata_sources?.length ? (
        <section className="dictionary-sources" aria-label="한자 사전 출처">
          <p>
            <CircleCheck size={14} />{" "}
            {item.metadata_status === "verified"
              ? "사전 대조 완료"
              : "일부 사전 대조"}
            {item.metadata_verified_at && ` · ${item.metadata_verified_at}`}
          </p>
          {item.metadata_sources.map((source) => (
            <a
              key={`${source.field}:${source.url}`}
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              {source.label}
              {source.license && ` · ${source.license}`}{" "}
              <ArrowRight size={13} />
            </a>
          ))}
        </section>
      ) : null}
    </dialog>
  );
}
function DataPanel({
  onNotice,
  counts,
}: {
  onNotice: (s: string) => void;
  counts: { vocabulary: number; kanji: number; history: number };
}) {
  const registrations = useLiveQuery(() => db.metadata.toArray(), []) ?? [];
  const [input, setInput] = useState("");
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [fileName, setFileName] = useState("");
  const parse = () => {
    setError("");
    setResult("");
    try {
      if (format === "csv") return parseCSV(input);
      const data: unknown = JSON.parse(input);
      if (typeof data === "object" && data !== null && "format" in data) {
        setPending(parseBackup(data));
        return null;
      }
      return parseDataset(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 형식을 확인해주세요.");
      return null;
    }
  };
  const importData = async () => {
    const data = parse();
    if (!data) return;
    setBusy(true);
    try {
      const result = await mergeDataset(data);
      setResult(
        `새 단어 ${result.added}개 · 새 한자 ${result.kanji_added}개 등록 · 중복 ${result.duplicates}개 병합 · 오류 ${result.errors.length}개. 학습 기록과 즐겨찾기는 유지됩니다.`,
      );
    } catch {
      setError("저장에 실패했습니다. 형식 또는 저장 공간을 확인해주세요.");
    } finally {
      setBusy(false);
    }
  };
  const download = async (full: boolean) => {
    try {
      const data = await exportBackup();
      const contents = full
        ? data
        : { kanji: data.kanji, vocabulary: data.vocabulary };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(contents, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `kotoba-${full ? "backup" : "words"}-${localDay(new Date())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onNotice(
        full
          ? "단어와 모든 학습 기록을 백업했습니다."
          : "단어·한자 데이터를 내보냈습니다.",
      );
    } catch {
      setError("내보내기에 실패했습니다. 다시 시도해주세요.");
    }
  };
  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending);
      setResult(
        `백업 복원 완료: 단어 ${pending.vocabulary.length}개, 풀이 기록 ${pending.history.length}개.`,
      );
      setPending(null);
    } catch {
      setError("복원에 실패했습니다. 기존 데이터는 유지됩니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR DATA, YOUR SPACE</span>
          <h1>나만의 학습 데이터를 담아요</h1>
          <p>단어를 추가하고, 소중한 학습 기록을 안전하게 보관하세요.</p>
        </div>
      </div>
      {registrations
        .filter((r) => r.key.startsWith("dataset:"))
        .map((r) => (
          <div className="info-note" key={r.key} role="status">
            해커스 2–4쪽 자동 등록: 새 단어 {r.report.added}개 · 새 한자{" "}
            {r.report.kanji_added}개 · 중복 {r.report.duplicates}개 · 오류{" "}
            {r.report.errors.length}개. 기기별 기존 데이터에 따라 등록 수는
            달라집니다.
          </div>
        ))}
      {registrations
        .filter((r) => r.key.startsWith("dictionary:"))
        .map((r) => (
          <div className="info-note" key={r.key} role="status">
            한자 사전 보완: {r.report.kanji_updated}개 적용 · 기존 학습 기록과
            즐겨찾기 유지. 실제 독음과 출처는 단어장 → 한자 카드에서 확인할 수
            있어요.
          </div>
        ))}
      <div className="data-summary">
        <span>
          단어 <b>{counts.vocabulary}개</b>
        </span>
        <span>
          한자 <b>{counts.kanji}개</b>
        </span>
        <span>
          풀이 기록 <b>{counts.history}개</b>
        </span>
      </div>
      <div className="data-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>
              <Upload size={20} /> 데이터 가져오기
            </h2>
          </div>
          <p>
            JSON 또는 CSV를 붙여넣거나 파일을 선택하세요.
            <br />
            같은 단어는 병합하고 기존 학습 기록은 유지해요.
          </p>
          <div className="segmented">
            <button
              className={format === "json" ? "active" : ""}
              onClick={() => setFormat("json")}
            >
              JSON
            </button>
            <button
              className={format === "csv" ? "active" : ""}
              onClick={() => setFormat("csv")}
            >
              CSV
            </button>
          </div>
          <label className="file-input">
            <Upload size={18} />
            {fileName || "파일 선택 (.json, .csv)"}
            <input
              aria-label="데이터 파일 선택"
              type="file"
              accept=".json,.csv,application/json,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 5 * 1024 * 1024) {
                    setError("파일은 5MB 이하로 선택해주세요.");
                    return;
                  }
                  try {
                    setInput(await file.text());
                    setFileName(file.name);
                    setFormat(
                      file.name.toLowerCase().endsWith(".csv") ? "csv" : "json",
                    );
                    setError("");
                  } catch {
                    setError("파일을 읽지 못했습니다.");
                  }
                }
              }}
            />
          </label>
          <label className="input-label" htmlFor="import-content">
            데이터 내용
          </label>
          <textarea
            id="import-content"
            spellCheck={false}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setFileName("");
            }}
            placeholder={
              format === "json"
                ? '[{"word":"変更","reading":"へんこう","meanings_ko":["변경"]}]'
                : "word,reading,meanings_ko\n変更,へんこう,변경"
            }
          />
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          {result && (
            <div className="inline-success" role="status">
              <Check size={17} />
              {result}
            </div>
          )}
          <button
            className="primary"
            disabled={!input.trim() || busy}
            onClick={importData}
          >
            {busy ? "저장 중…" : "검증하고 가져오기"}
            <ArrowRight size={18} />
          </button>
        </section>
        <div>
          <section className="panel">
            <h2>
              <Download size={20} /> 내보내기 · 백업
            </h2>
            <p>
              데이터는 이 브라우저에 저장됩니다. 브라우저 데이터를 삭제하거나
              기기를 바꾸기 전에 백업해주세요.
            </p>
            <button className="secondary full" onClick={() => download(true)}>
              <Download size={18} /> 전체 백업 다운로드
            </button>
            <p className="muted">단어 + 한자 + 풀이 기록 + 즐겨찾기</p>
            <button className="text-button" onClick={() => download(false)}>
              단어 데이터만 내보내기 <ArrowRight size={16} />
            </button>
          </section>
          <section className="panel format-guide">
            <h2>데이터 형식 안내</h2>
            <p>
              필수 항목은 단어, 읽기, 한국어 의미입니다. 확인되지 않은 한자
              독음은 비워두세요.
            </p>
            <pre>
              {format === "json"
                ? '[\n  {\n    "word": "変更",\n    "reading": "へんこう",\n    "meanings_ko": ["변경"]\n  }\n]'
                : "word,reading,meanings_ko\n変更,へんこう,변경\n断る,ことわる,거절하다"}
            </pre>
            <p className="muted">
              JSON은 vocabulary와 kanji 배열이 있는 객체도 지원합니다. CSV의
              여러 의미는 |로 구분하세요.
            </p>
          </section>
        </div>
      </div>
      <section className="install-note">
        <span className="stat-icon green">
          <Download size={23} />
        </span>
        <div>
          <h2>홈 화면에 두고, 오프라인에서도.</h2>
          <p>
            iPhone Safari에서 공유 → ‘홈 화면에 추가’를 선택하세요. 앱을
            온라인에서 한 번 열면 인터넷 없이 학습할 수 있어요. 다른 브라우저는
            설치 메뉴를 이용하세요.
          </p>
        </div>
      </section>
      {pending && (
        <div className="confirm-overlay">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-title"
          >
            <h2 id="restore-title">백업을 복원할까요?</h2>
            <p>
              이 브라우저의 현재 데이터와 학습 기록을 백업 내용으로 <b>교체</b>
              합니다. 현재 데이터를 먼저 내보내는 것을 권장해요.
            </p>
            <p>
              단어 {pending.vocabulary.length}개 · 기록 {pending.history.length}
              개<br />
              백업 날짜: {dateLabel(pending.exported_at)}
            </p>
            <div className="result-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setPending(null)}
              >
                취소
              </button>
              <button className="primary" disabled={busy} onClick={restore}>
                {busy ? "복원 중…" : "백업으로 교체·복원"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
export default App;
