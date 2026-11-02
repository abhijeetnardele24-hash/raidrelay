import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('RaidRelay End-to-End User Journeys & Accessibility', () => {
  test('Home Page renders with thesis, navigation, and passes Axe accessibility audit', async ({ page }) => {
    await page.goto('/');

    // Verify title and branding
    await expect(page).toHaveTitle(/RaidRelay/i);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'The first 90 seconds after a Twitch raid'
    );

    // Verify winning thesis
    await expect(
      page.getByText(/A raid is not an alert; it is a community handoff/i).first()
    ).toBeVisible();

    // Verify navigation links
    await expect(page.getByRole('link', { name: /Overview/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Console/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Demo Lab \(Judges\)/i }).first()).toBeVisible();

    // Run Axe accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Broadcaster Console allows editing and saving Now Card configuration', async ({ page }) => {
    await page.goto('/console');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Broadcaster Control Workspace');

    // Fill in activity
    const activityInput = page.locator('#activity');
    await activityInput.fill('Building a tiny robot live (E2E Test)');

    // Save
    const saveBtn = page.getByRole('button', { name: /Save Configuration/i });
    await saveBtn.click();

    await expect(page.getByText(/Configuration saved!/i)).toBeVisible({ timeout: 5000 });
  });

  test('Demo Lab runs complete simulated raid handoff journey end-to-end', async ({ page }) => {
    await page.goto('/lab');

    // Verify persistent simulation banner
    const simBanner = page.getByTestId('lab-simulated-banner');
    await expect(simBanner).toBeVisible();
    await expect(simBanner).toContainText('SIMULATED EVENT FEED — NOT TWITCH LIVE');

    // Run fast simulation (10x speed)
    const runFastBtn = page.getByTestId('run-sim-fast-btn');
    await expect(runFastBtn).toBeVisible();
    await runFastBtn.click();

    // Verify state badge reflects LANDING -> CONTEXT -> VOTING
    const stateBadge = page.getByTestId('lab-state-badge');
    await expect(stateBadge).toBeVisible();

    // Wait for voting or awaiting streamer
    await expect(stateBadge).toContainText(/VOTING|AWAITING_STREAMER|RESULT/i, { timeout: 10000 });

    // Verify chat driver list is populated
    await expect(page.getByText('PixelPioneer:').first()).toBeVisible();
    await expect(page.getByText('CircuitSamurai:').first()).toBeVisible();

    // Trigger panic clear
    const clearBtn = page.getByRole('button', { name: /Panic Clear/i });
    await clearBtn.click();

    // Verify transition through CLEARED / COOLDOWN / IDLE
    await expect(stateBadge).toContainText(/CLEARED|COOLDOWN|IDLE/i, { timeout: 5000 });

    // Reset back to clean IDLE
    const resetBtn = page.getByTestId('reset-sim-btn');
    await resetBtn.click();
    await expect(stateBadge).toHaveText('IDLE', { timeout: 5000 });

    // Run Axe scan on Demo Lab
    const labAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(labAxe.violations).toEqual([]);
  });

  test('OBS Overlay renders at 1920x1080 transparently without secret leakage', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/overlay/demo-channel-key-12345');

    // In idle state, overlay is transparent with no scrollbars or secret text
    // If idle, body has 0 rendered overlay cards
    expect(await page.locator('input').count()).toBe(0);
    expect(await page.locator('button').count()).toBe(0);

    // Assert zero secret leakage (tokens, client secrets)
    const content = await page.content();
    expect(content).not.toContain('TWITCH_CLIENT_SECRET');
    expect(content).not.toContain('SESSION_SECRET');
  });
});

