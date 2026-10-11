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
  await page.screenshot({ path: "/tmp/kotoba-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "학습 시작하기" }).click();
  for (let i = 0; i < 6; i++) {
    const word = (await page.locator(".question-word>span").textContent())!;
    const reading = (await page
      .locator(".quiz-heading h1")
      .textContent())!.includes("읽을");
    const right = (reading ? answers : meanings)[word];
    const buttons = page.locator(".option");
    const texts = await buttons.allTextContents();
    const correct = texts.findIndex((v) => v.includes(right));
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
        name: i === 5 ? "결과 보기" : "다음 문제",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: i === 5 ? "결과 보기" : "다음 문제",
        exact: true,
      })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "오늘도 한 걸음 성장했어요!" }),
  ).toBeVisible();
  expect(await getRecords(page, "history")).toHaveLength(6);
  const progress = await getRecords(page, "progress");
  expect(progress.reduce((n, p) => n + Number(p.correct_count), 0)).toBe(4);
  expect(progress.reduce((n, p) => n + Number(p.wrong_count), 0)).toBe(2);
  await page.getByRole("button", { name: "홈으로 돌아가기" }).click();
  await page.reload();
  await expect(page.locator(".stat-card").first()).toContainText("6");
  await nav(page, "오답노트");
  await expect(page.locator(".word-card")).toHaveCount(2);
  await page.getByRole("button", { name: "오답 단어 복습" }).click();
  const wrongWord = (await page.locator(".question-word>span").textContent())!;
  const reading = (await page
    .locator(".quiz-heading h1")
    .textContent())!.includes("읽을");
  const right = (reading ? answers : meanings)[wrongWord];
  const options = await page.locator(".option").allTextContents();
  const idx = options.findIndex((s) => s.includes(right));
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
  await page.locator(".word-main").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").locator(".kanji-pills button").first().click();
  await expect(page.getByRole("dialog")).toContainText("음독");
  await expect(page.getByRole("dialog")).toContainText("미등록");
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
  await expect(page.getByRole("status")).toContainText("기존 단어 1개 병합");
  expect(await getRecords(page, "history")).toHaveLength(7);
  // Synthetic import fixture lives only in the isolated test browser.
  await page
    .getByLabel("데이터 내용")
    .fill(
      '[{"word":"変更する","reading":"へんこうする","meanings_ko":["변경하다"]}]',
    );
  await page.getByRole("button", { name: "검증하고 가져오기" }).click();
  await expect(page.getByRole("status")).toContainText("새 단어 1개 추가");
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
  expect(backup.history).toHaveLength(7);
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
  expect(await getRecords(page, "history")).toHaveLength(7);
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
