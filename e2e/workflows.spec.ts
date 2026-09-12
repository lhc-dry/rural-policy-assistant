import { test, expect } from "@playwright/test";
test("visitor chat streams an answer with source citations", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "访客进入" }).click();
  await page.getByRole("link", { name: "惠农补贴政策" }).click();
  await expect(page.getByText("知识库文档").first()).toBeVisible({
    timeout: 45000,
  });
  await page
    .getByRole("textbox", { name: "政策问题" })
    .fill("2025年粮食补贴申报");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(page.getByRole("button", { name: "有用" })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: /\[1\]/ }).first().click();
  await expect(page.getByRole("dialog", { name: "文件预览" })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "文件预览" }).locator("canvas"),
  ).toBeVisible();
});
test("admin route guard and announcement draft publishing", async ({
  page,
}) => {
  await page.goto("/admin/announcements");
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("账号", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "登录后台" }).click();
  await expect(page).toHaveURL(/admin\/announcements/);
  await page.getByRole("textbox", { name: "公告标题" }).fill("演示公告");
  await page
    .getByRole("textbox", { name: "公告内容" })
    .fill("这是一条用于验证发布流程的演示公告。");
  await page.getByRole("button", { name: "发布公告" }).click();
  await expect(
    page.getByRole("cell", { name: "演示公告", exact: true }),
  ).toBeVisible();
});
