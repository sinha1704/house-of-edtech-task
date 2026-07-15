import { test, expect } from '@playwright/test';

test.describe('Offline-First Document Editing & Collaboration E2E Test Suite', () => {
  
  test.beforeEach(async ({ page }) => {
    // 1. Visit homepage
    await page.goto('/');
  });

  test('should support offline editing, instant UI updates, and automatic background sync recovery', async ({ page, context }) => {
    // 2. Click the "Owner Account" Quick Login card to initiate session and cookies
    const ownerCard = page.locator('button:has-text("Owner Account")');
    await expect(ownerCard).toBeVisible();
    await ownerCard.click();

    // 3. Confirm redirection to document workspace
    await expect(page).toHaveURL(/\/documents\/default-doc/);

    // 4. Verify Sync Engine is initialized and says "Synced with Cloud"
    const syncBadge = page.locator('span:has-text("Synced with Cloud")');
    await expect(syncBadge).toBeVisible();

    // 5. Select document writing editor textarea
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    
    // Clear and input a baseline test sentence
    await textarea.fill('Baseline Playwright content.');
    await page.waitForTimeout(600); // Wait for debounce persistence (400ms)

    // 6. Simulate Network Dropout using browser emulation contexts
    await context.setOffline(true);
    
    // Verify Network Badge reflects offline transition instantly
    const offlineBadge = page.locator('span:has-text("Offline (Saving locally)")');
    await expect(offlineBadge).toBeVisible();

    // 7. Perform multiple edits while offline
    const offlineText = '\nThis edit was made offline during network disconnect.';
    await textarea.pressSequentially(offlineText, { delay: 10 });

    // Assert that the text value in the editor updates instantly with 0ms input lag
    const textValue = await textarea.inputValue();
    expect(textValue).toContain('This edit was made offline during network disconnect.');

    // Verify status still shows saved locally
    await expect(offlineBadge).toBeVisible();

    // 8. Reconnect Network
    await context.setOffline(false);

    // Verify background sync engine reconnects and flushes queue
    const syncBadgeAfterReconnect = page.locator('span:has-text("Synced with Cloud")');
    await expect(syncBadgeAfterReconnect).toBeVisible({ timeout: 10000 });

    // 9. Inspect snapshot creation workflow
    // Enter checkpoint comment
    const commentInput = page.locator('input[placeholder="Save checkpoint comment..."]');
    await expect(commentInput).toBeVisible();
    await commentInput.fill('Playwright Integration Snapshot v1');

    // Click Snapshot button
    const captureButton = page.locator('button:has-text("Capture Snapshot")');
    await expect(captureButton).toBeEnabled();
    await captureButton.click();

    // Verify snapshot entry is logged in Version Timeline sidebar
    const snapshotTimelineText = page.locator('p:has-text("Playwright Integration Snapshot v1")');
    await expect(snapshotTimelineText).toBeVisible({ timeout: 5000 });
  });

  test('should respect strict RBAC boundaries when switched to VIEWER role', async ({ page }) => {
    // 1. Log in as Owner first
    const ownerCard = page.locator('button:has-text("Owner Account")');
    await ownerCard.click();
    await expect(page).toHaveURL(/\/documents\/default-doc/);

    // 2. Locate role selector dropdown and switch session to VIEWER
    const roleSelector = page.locator('button:has-text("Role: Owner")');
    await expect(roleSelector).toBeVisible();
    await roleSelector.click();

    const viewerOption = page.locator('[role="option"]:has-text("Role: Viewer")');
    await expect(viewerOption).toBeVisible();
    await viewerOption.click();

    // 3. Confirm UI elements lock in response to VIEWER permissions
    const viewerBadge = page.locator('span:has-text("View Only")');
    await expect(viewerBadge).toBeVisible();

    // 4. Assert that editing textarea is disabled or readOnly
    const textarea = page.locator('textarea');
    await expect(textarea).toBeDisabled();

    // 5. Assert that write buttons like Snapshot Creation are hidden or unavailable
    const captureButton = page.locator('button:has-text("Capture Snapshot")');
    await expect(captureButton).not.toBeVisible();
  });
});
