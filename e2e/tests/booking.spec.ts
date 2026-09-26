import { expect, test } from "@playwright/test";

import { createBookableBusiness, uniqueEmail } from "../support/api";

test("a new customer signs up, books through chat, confirms and cancels", async ({ page }) => {
  const business = await createBookableBusiness();

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Cara Customer");
    await page.getByLabel("Email").fill(uniqueEmail("customer"));
    await page.locator("#signup-password").fill("Password123");
    await page.locator("#signup-password-confirmation").fill("Password123");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/book**");
  });

  await test.step("book through the assistant", async () => {
    await page.goto(`/book?business=${business.slug}`);
    await expect(page.getByText("Booking with this business").or(page.getByText(business.name)).first()).toBeVisible();

    const composer = page.getByLabel("Describe your appointment");

    await composer.fill("Book a haircut tomorrow at 10:00");
    await composer.press("Enter");

    const confirm = page.getByRole("button", { name: "Confirm booking" }).first();

    await expect(confirm).toBeEnabled();
    await confirm.click();
    await page.getByRole("button", { name: "Confirm appointment" }).click();
    await expect(page.getByText("Your appointment has been booked successfully.")).toBeVisible();
  });

  await test.step("cancel from my appointments", async () => {
    await page.goto("/appointments");
    await page.getByText(`${business.name} · Sana`).first().click();
    await page.getByRole("button", { name: "Cancel appointment" }).click();

    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Reason (optional)").fill("Plans changed");
    await dialog.getByRole("button", { name: "Cancel appointment" }).click();
    await expect(page.getByText("Appointment cancelled.")).toBeVisible();
  });
});

test("the assistant declines requests that aren't bookings", async ({ page }) => {
  const business = await createBookableBusiness();

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Omar Outofscope");
  await page.getByLabel("Email").fill(uniqueEmail("customer"));
  await page.locator("#signup-password").fill("Password123");
  await page.locator("#signup-password-confirmation").fill("Password123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/book**");

  await page.goto(`/book?business=${business.slug}`);

  const composer = page.getByLabel("Describe your appointment");

  await composer.fill("What's the weather like in Paris?");
  await composer.press("Enter");

  await expect(page.getByText("I can only help with booking appointments here.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm booking" })).toHaveCount(0);
});
