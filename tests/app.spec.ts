import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const answers: Record<string, string> = {
  変更: "へんこう",
  断る: "ことわる",
  関係: "かんけい",
  予定: "よてい",
  必要: "ひつよう",
  間に合う: "まにあう",
};
const meanings: Record<string, string> = {
  変更: "변경",
  断る: "거절하다",
  関係: "관계",
  予定: "예정",
  必要: "필요",
  間に合う: "시간에 맞다",
};
async function nav(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "모바일 메뉴" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function getRecords(page: Page, store: string) {
  return page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("kotoba-n3");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const r = database.transaction(name).objectStore(name).getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      database.close();
    }
  }, store);
}
test("mobile quiz, history, wrong notes, favorites, import, merge, backup and restore", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘도, 한 단어씩" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const v of await getRecords(page, "vocabulary")) {
    answers[String(v.word)] = String(v.reading);
    meanings[String(v.word)] = (v.meanings_ko as string[]).join(", ");
  }
  await page.screenshot({ path: "/tmp/kotoba-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "학습 시작하기" }).click();
  for (let i = 0; i < 10; i++) {
    const word = (await page.locator(".question-word>span").textContent())!;
    const reading = (await page
      .locator(".quiz-heading h1")
      .textContent())!.includes("읽을");
    const right = (reading ? answers : meanings)[word];
    const buttons = page.locator(".option");
    const texts = await page
      .locator(".option > span:nth-child(2)")
      .allTextContents();
    const correct = texts.findIndex((v) => v === right);
    if (i === 0)
      await page
        .getByRole("button", { name: "즐겨찾기 추가", exact: true })
        .click();
    await buttons.nth(i < 2 ? (correct + 1) % 4 : correct).click();
    await page.getByRole("button", { name: "정답 확인", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      i < 2 ? "괜찮아요" : "정답이에요",
    );
    // Save must occur once even if checking is retried rapidly.
    await expect(
      page.getByRole("button", {
        name: i === 9 ? "결과 보기" : "다음 문제",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: i === 9 ? "결과 보기" : "다음 문제",
        exact: true,
      })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "오늘도 한 걸음 성장했어요!" }),
  ).toBeVisible();
  expect(await getRecords(page, "history")).toHaveLength(10);
  const progress = await getRecords(page, "progress");
  expect(progress.reduce((n, p) => n + Number(p.correct_count), 0)).toBe(8);
  expect(progress.reduce((n, p) => n + Number(p.wrong_count), 0)).toBe(2);
  await page.getByRole("button", { name: "홈으로 돌아가기" }).click();
  await page.reload();
  await expect(page.locator(".stat-card").first()).toContainText("10");
  await nav(page, "오답노트");
  await expect(page.locator(".word-card")).toHaveCount(2);
  await page.getByRole("button", { name: "오답 단어 복습" }).click();
  const wrongWord = (await page.locator(".question-word>span").textContent())!;
  const reading = (await page
    .locator(".quiz-heading h1")
    .textContent())!.includes("읽을");
  const right = (reading ? answers : meanings)[wrongWord];
  const options = await page
    .locator(".option > span:nth-child(2)")
    .allTextContents();
  const idx = options.findIndex((s) => s === right);
  await page
    .locator(".option")
    .nth((idx + 1) % 4)
    .click();
  await page.getByRole("button", { name: "정답 확인", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "학습 종료" }).click();
  await expect(page.locator(".word-card")).toHaveCount(2);
  await expect(
    page.locator(".word-card").filter({ hasText: wrongWord }),
  ).toContainText("오답 2회");
  await nav(page, "즐겨찾기");
  await expect(page.locator(".word-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "즐겨찾기 해제", exact: true })
    .click();
  await expect(page.locator(".word-card")).toHaveCount(0);
  await nav(page, "단어장");
  await page
    .locator(".word-card")
    .filter({ hasText: "変更" })
    .locator(".word-main")
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").locator(".kanji-pills button").first().click();
  await expect(page.getByRole("dialog")).toContainText("음독");
  await expect(page.getByRole("dialog")).toContainText("사전 대조 완료");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "즐겨찾기 추가", exact: true })
    .click();
  await page.getByRole("button", { name: "상세 닫기" }).click();
  await nav(page, "데이터");
  await page
    .getByLabel("데이터 내용")
    .fill(
      '[{"word":"変更","reading":"へんこう","meanings_ko":["변경","변화"]}]',
    );
  await page.getByRole("button", { name: "검증하고 가져오기" }).click();
  await expect(page.locator(".inline-success")).toContainText("새 단어 0개");
  expect(await getRecords(page, "history")).toHaveLength(11);
  // Synthetic import fixture lives only in the isolated test browser.
  await page
    .getByLabel("데이터 내용")
    .fill(
      '[{"word":"変更する","reading":"へんこうする","meanings_ko":["변경하다"]}]',
    );
  await page.getByRole("button", { name: "검증하고 가져오기" }).click();
  await expect(page.locator(".inline-success")).toContainText("새 단어 1개");
  await page
    .getByLabel("데이터 내용")
    .fill('[{"word":"","reading":"へんこう","meanings_ko":["변경"]}]');
  await page.getByRole("button", { name: "검증하고 가져오기" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 백업 다운로드" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const backup = JSON.parse(await readFile(file!, "utf8"));
  expect(backup.history).toHaveLength(11);
  expect(
    backup.progress.some((p: { is_favorite: boolean }) => p.is_favorite),
  ).toBe(true);
  await page.getByLabel("데이터 내용").fill(JSON.stringify(backup));
  await page.getByRole("button", { name: "검증하고 가져오기" }).click();
  await expect(page.getByRole("dialog")).toContainText("교체");
  await page.getByRole("button", { name: "백업으로 교체·복원" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "백업 복원 완료" }),
  ).toBeVisible();
  await page.reload();
  expect(await getRecords(page, "history")).toHaveLength(11);
});
test("installed service worker supports offline reload and new learning records", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘도, 한 단어씩" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "오늘도, 한 단어씩" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "학습 시작하기" }).click();
  await page.locator(".option").first().click();
  await page.getByRole("button", { name: "정답 확인", exact: true }).click();
  await expect(page.locator(".feedback")).toBeVisible();
  expect(await getRecords(page, "history")).toHaveLength(1);
  await context.setOffline(false);
});
test("desktop layout has no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘도, 한 단어씩" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/kotoba-desktop.png", fullPage: true });
});

test("version 1 browser upgrade preserves user records and registers book data once", async ({
  page,
}) => {
  await page.goto("/icon.svg");
  await page.evaluate(async () => {
    const request = indexedDB.open("kotoba-n3", 10);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const d = request.result;
        const k = d.createObjectStore("kanji", { keyPath: "id" });
        k.createIndex("character", "character", { unique: true });
        const v = d.createObjectStore("vocabulary", { keyPath: "id" });
        v.createIndex("word", "word", { unique: true });
        const h = d.createObjectStore("history", {
          keyPath: "id",
          autoIncrement: true,
        });
        h.createIndex("[item_type+item_id]", ["item_type", "item_id"]);
        h.createIndex("studied_at", "studied_at");
        const p = d.createObjectStore("progress", {
          keyPath: ["item_type", "item_id"],
        });
        p.createIndex("item_type", "item_type");
        p.createIndex("item_id", "item_id");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = database.transaction(
      ["kanji", "vocabulary", "history", "progress"],
      "readwrite",
    );
    const words = [
      ["変更", "へんこう", "변경"],
      ["断る", "ことわる", "거절하다"],
      ["関係", "かんけい", "관계"],
      ["予定", "よてい", "예정"],
      ["必要", "ひつよう", "필요"],
      ["間に合う", "まにあう", "시간에 맞다"],
    ];
    const chars = [
      ...new Set(
        words.flatMap(([word]) => word.match(/\p{Script=Han}/gu) ?? []),
      ),
    ];
    chars.forEach((character) =>
      tx.objectStore("kanji").add({
        id: `k:${character}`,
        character,
        korean_hun: "",
        korean_eum: "",
        onyomi: [],
        kunyomi: [],
        meanings_ko: [],
      }),
    );
    words.forEach(([word, reading, meaning]) =>
      tx.objectStore("vocabulary").add({
        id: `v:${word}`,
        word,
        reading,
        meanings_ko: [meaning],
        kanji_ids: (word.match(/\p{Script=Han}/gu) ?? []).map((c) => `k:${c}`),
      }),
    );
    const date = new Date().toISOString();
    tx.objectStore("history").add({
      id: 1,
      item_type: "vocabulary",
      item_id: "v:変更",
      question_type: "reading",
      selected_answer: "wrong",
      is_correct: false,
      studied_at: date,
    });
    tx.objectStore("progress").add({
      item_type: "vocabulary",
      item_id: "v:変更",
      correct_count: 0,
      wrong_count: 1,
      last_studied_at: date,
      next_review_at: date,
      is_favorite: true,
    });
    tx.objectStore("progress").add({
      item_type: "kanji",
      item_id: "k:予",
      correct_count: 0,
      wrong_count: 0,
      last_studied_at: null,
      next_review_at: null,
      is_favorite: true,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘도, 한 단어씩" }),
  ).toBeVisible();
  expect(await getRecords(page, "vocabulary")).toHaveLength(150);
  expect(await getRecords(page, "kanji")).toHaveLength(227);
  expect(await getRecords(page, "history")).toHaveLength(1);
  const progress = await getRecords(page, "progress");
  expect(progress).toHaveLength(2);
  expect(progress.every((p) => p.is_favorite === true)).toBe(true);
  const v = (await getRecords(page, "vocabulary")).find(
    (v) => v.word === "改札",
  )!;
  expect(v.starred_in_book).toBe(true);
  expect(v.kanji_ids).toEqual(["k:改", "k:札"]);
  const k = (await getRecords(page, "kanji")).find(
    (k) => k.character === "改",
  )!;
  expect(k.onyomi).toContain("カイ");
  expect(k.korean_hun).toBe("고칠");
  await nav(page, "데이터");
  await expect(
    page.getByRole("status").filter({ hasText: "해커스" }),
  ).toContainText("새 단어 144개 · 새 한자 216개 · 중복 5개 · 오류 0개");
  await nav(page, "단어장");
  await page.getByLabel("단어 검색").fill("改札");
  await page.locator(".word-main").click();
  await expect(page.getByRole("dialog")).toContainText("교재 별표 단어");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "즐겨찾기 추가", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "상세 닫기" }).click();
  await page.reload();
  expect(await getRecords(page, "vocabulary")).toHaveLength(150);
  expect(await getRecords(page, "history")).toHaveLength(1);
  expect(await getRecords(page, "progress")).toEqual(progress);
});

test("dictionary cards show huneum, Japanese readings, variants, sources and unlisted kunyomi offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘도, 한 단어씩" }),
  ).toBeVisible();
  await nav(page, "단어장");
  await page.getByRole("button", { name: "한자 227", exact: true }).click();
  await page.getByLabel("단어 검색").fill("学");
  await page.locator(".word-main").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("배울 학");
  await expect(dialog).toContainText("ガク");
  await expect(dialog).toContainText("まな.ぶ");
  await expect(dialog).toContainText("한국 한자 대응 글자: 學");
  await expect(dialog).toContainText("사전 대조 완료");
  await expect(
    dialog.getByRole("link", { name: /EDRDG KANJIDIC2/ }),
  ).toHaveAttribute(
    "href",
    "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project",
  );
  await page.screenshot({ path: "/tmp/kotoba-kanji-school.png" });
  await page.getByRole("button", { name: "상세 닫기" }).click();
  await page.getByLabel("단어 검색").fill("駅");
  await page.locator(".word-main").click();
  await expect(dialog).toContainText("역 역");
  await expect(dialog).toContainText("エキ");
  await expect(dialog).toContainText("사전 등재 없음");
  await expect(dialog).toContainText("한국 한자 대응 글자: 驛");
  await page.getByRole("button", { name: "상세 닫기" }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "오늘도, 한 단어씩" }),
  ).toBeVisible();
  await nav(page, "단어장");
  await page.getByRole("button", { name: "한자 227", exact: true }).click();
  await page.getByLabel("단어 검색").fill("駅");
  await page.locator(".word-main").click();
  await expect(dialog).toContainText("사전 등재 없음");
  await expect(dialog).toContainText("사전 대조 완료");
  await context.setOffline(false);
});

test("unknown answers persist as wrong reviews and mobile actions stay visible without changing kanji size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘도, 한 단어씩" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "학습 시작하기" }).click();
  const confirm = page.getByRole("button", { name: "정답 확인", exact: true });
  const checkAction = async () => {
    const rect = await confirm.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(667);
    expect(
      await page
        .locator(".quiz-footer")
        .evaluate((e) => getComputedStyle(e).position),
    ).toBe("fixed");
  };
  await checkAction();
  expect(
    await page
      .locator(".question-word>span")
      .evaluate((e) => getComputedStyle(e).fontSize),
  ).toBe("52px");
  expect(await getRecords(page, "history")).toHaveLength(0);
  await page.getByRole("button", { name: "모르겠어요", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "모르겠어요", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(confirm).toBeEnabled();
  expect(await getRecords(page, "history")).toHaveLength(0);
  await page.locator(".option").first().click();
  await expect(
    page.getByRole("button", { name: "모르겠어요", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "모르겠어요", exact: true }).click();
  await checkAction();
  const word = (await page.locator(".question-word>span").textContent())!;
  await confirm.click();
  await expect(page.locator(".feedback")).toContainText("괜찮아요");
  const history = await getRecords(page, "history");
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({
    response_type: "unknown",
    selected_answer: "모르겠어요",
    is_correct: false,
    item_id: `v:${word}`,
  });
  const progress = await getRecords(page, "progress");
  expect(progress[0]).toMatchObject({ wrong_count: 1, correct_count: 0 });
  const next = page.getByRole("button", { name: "다음 문제", exact: true });
  await expect(next).toBeVisible();
  const nextRect = (await next.boundingBox())!;
  expect(nextRect.y + nextRect.height).toBeLessThanOrEqual(667);
  await expect
    .poll(async () => {
      const f = (await page.locator(".feedback").boundingBox())!;
      const bar = (await page.locator(".quiz-footer").boundingBox())!;
      return f.y + f.height <= bar.y + 1;
    })
    .toBe(true);
  await page.screenshot({ path: "/tmp/kotoba-unknown-mobile.png" });
  await next.click();
  await expect(
    page.getByRole("button", { name: "정답 확인", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "모르겠어요", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  expect(await getRecords(page, "history")).toHaveLength(1);
  await nav(page, "오답노트");
  await expect(page.locator(".word-card")).toHaveCount(1);
  await expect(page.locator(".word-card")).toContainText(word);
});
