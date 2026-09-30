/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@playwright/test";

test("App renders its loading state", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "Loading Shared container..." }),
	).toBeVisible();
});
