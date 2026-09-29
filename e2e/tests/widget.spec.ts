import { createServer } from "node:http";

import { expect, test, type Page } from "@playwright/test";

import { WEB_URL } from "../playwright.config";
import { allowWidgetOn, createBookableBusiness, uniqueEmail } from "../support/api";

/** A business's own website, served by the test so it has a real origin other than BookWise's. */
const HOST_PORT = 3999;
const HOST_SITE = `http://localhost:${HOST_PORT}`;

async function signUp(page: Page, fullName: string): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(fullName);
  await page.getByLabel("Email").fill(uniqueEmail("customer"));
  await page.locator("#signup-password").fill("Password123");
  await page.locator("#signup-password-confirmation").fill("Password123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/book**");
}

function tomorrow(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

test("the public page shows the business, and its booking form books step by step", async ({ page }) => {
  const business = await createBookableBusiness();

  await signUp(page, "Pia Public");

  await test.step("public page", async () => {
    await page.goto(`/b/${business.slug}`);
    await expect(page.getByRole("heading", { name: business.name })).toBeVisible();
    await expect(page.getByText("Haircut").first()).toBeVisible();
    await expect(page.getByText("No reviews yet.")).toBeVisible();
  });

  await test.step("book through the form", async () => {
    await page.goto(`/embed/${business.slug}`);
    await expect(page.getByText(`Book with ${business.name}`)).toBeVisible();

    await page.getByRole("button", { name: /Haircut/ }).click();
    await page.getByRole("button", { name: "Anyone available" }).click();
    await page.locator("#public-booking-date").fill(tomorrow());
    await page.getByRole("radio").first().click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Confirm booking" }).click();

    await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
  });
});

test("the widget opens booking in a frame on the business's own website", async ({ page }) => {
  const business = await createBookableBusiness();

  // Allowed before the frame is ever requested, since the frame policy is cached briefly.
  await allowWidgetOn(business, HOST_SITE);
  // A real server rather than a routed page, so Chrome sees both sites on the same (local) network.
  const site = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      `<!doctype html><html><head><title>Salon website</title></head><body><h1>Welcome to our salon</h1><script src="${WEB_URL}/widget.js" data-business="${business.slug}"></script></body></html>`,
    );
  });

  await new Promise<void>((resolve) => site.listen(HOST_PORT, resolve));

  try {
    await page.goto(`${HOST_SITE}/`);
    await openAndCloseWidget(page, business.name);
  } finally {
    await new Promise((resolve) => site.close(resolve));
  }
});

/** Opens the widget from its launcher, checks the booking frame, and closes it from inside. */
async function openAndCloseWidget(page: Page, businessName: string): Promise<void> {
  const launcher = page.getByRole("button", { name: "Book now" });

  await launcher.click();
  await expect(launcher).toHaveAttribute("aria-expanded", "true");

  const frame = page.frameLocator('iframe[title="Book an appointment"]');

  await expect(frame.getByText(`Book with ${businessName}`)).toBeVisible();
  await expect(frame.getByRole("button", { name: /Haircut/ })).toBeVisible();

  // The frame's close button asks the host page to close it.
  await frame.getByRole("button", { name: "Close" }).click();
  await expect(page.locator('iframe[title="Book an appointment"]')).toBeHidden();
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
}
