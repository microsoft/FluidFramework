/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("spaces", () => {
    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    // Test skipped on LTS - this test fails after LTS was upgraded to pnpm,
    // but the failure appears to be puppetteer related - the page it's testing works when run manually.
    // Since this test was removed on main, we've decided to skip it on LTS.
    it.skip("There's a button to be clicked", async () => {
        await expect(page).toClick("button", { text: "Edit: true" });
    });
});
