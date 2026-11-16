import { test, expect } from "@playwright/test";

test.describe("My BOT Collection E2E Verification", () => {
  test("Binder search, unlimited surplus stepper, TCG Thailand link, Competitive Deck import, and Analytics tabs with 0 console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto("/");

    // 1. Binder loads and shows catalog cards
    await expect(page.getByText("My BOT Collection")).toBeVisible();
    const searchInput = page.getByLabel("ค้นหาการ์ด");
    await searchInput.fill("ความเจริญ");

    const targetCard = page.getByTestId("binder-card-B2SA-008").first();
    await expect(targetCard).toBeVisible();

    // 2. Increment card quantity past playset 4 -> 5 to verify unlimited surplus
    const incBtn = page.getByLabel("เพิ่มจำนวน ความเจริญ").first();
    for (let i = 0; i < 5; i++) {
      await incBtn.click();
    }
    await expect(targetCard).toContainText("5 ใบ");
    await expect(targetCard).toContainText("(+1 ซ้ำ)");

    // 3. Open Card Detail Drawer and check TCG Thailand price & link
    await targetCard.getByText("ความเจริญ").click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    const tcgLink = drawer.locator('a[href*="tcgthailand.com"]').first();
    await expect(tcgLink).toHaveAttribute("href", /https:\/\/www\.tcgthailand\.com\/product/);
    await drawer.getByLabel("ปิดหน้าต่าง").click();

    // 4. Switch to Decks view, load sample recipe, import, and inspect Gap & Budget
    await page.getByTestId("nav-decks").click();
    await page.getByText("ใส่ตัวอย่าง Recipe").click();
    await page.getByTestId("import-recipe-btn").click();
    await expect(page.getByTestId("deck-gap-summary")).toBeVisible();
    await expect(page.getByTestId("deck-budget-missing-cost")).toContainText("฿");

    // 5. Switch to Analysis view and cycle through all 4 tabs
    await page.getByTestId("nav-analytics").click();
    await expect(page.getByTestId("surplus-trade-value")).toContainText("฿");

    await page.getByTestId("analytics-tab-completion").click();
    await expect(page.getByText("ความคืบหน้า Playset (4 ใบ/ชื่อ) เทียบ Master Set")).toBeVisible();

    await page.getByTestId("analytics-tab-valuation").click();
    await expect(page.getByText("อันดับการ์ดมูลค่าสูงสุดในคลังของคุณ")).toBeVisible();

    await page.getByTestId("analytics-tab-deck-sim").click();
    await expect(page.getByText("กราฟค่าร่าย Main Deck (Cost 0–10+)")).toBeVisible();

    await page.getByTestId("analytics-tab-trade-backup").click();
    await expect(page.getByText("สร้างใบประกาศคอมมูนิตี้ (Hunting & Trade Sheet)")).toBeVisible();

    // 6. Test Cloud Sync Modal push & pull
    await page.getByTestId("cloud-sync-btn").click();
    await page.getByTestId("cloud-sync-key-input").fill("e2e-bot-vault-01");
    await page.getByTestId("cloud-push-btn").click();
    await expect(page.getByText("บันทึกขึ้น Cloud สำเร็จ")).toBeVisible();
    await page.getByTestId("cloud-pull-btn").click();
    await expect(page.getByText("ดึงข้อมูลสำเร็จ")).toBeVisible();
    await page.getByLabel("ปิดหน้าต่าง Cloud Sync").click();

    // Assert zero console/page errors throughout the entire E2E flow
    expect(consoleErrors).toEqual([]);
  });
});
