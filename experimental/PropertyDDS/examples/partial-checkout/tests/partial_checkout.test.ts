/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("partial checkout", () => {
    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    it("loads and there's a button with Commit", async () => {
        // Validate there is a button that can be clicked
        await expect(page).toClick("#commit", { text: "Commit" });
    });

    it("loads and there's a button for creating random board", async () => {
        // Validate there is a button that can be clicked
        await expect(page).toClick("#random", { text: "Create Random Board" });
    });
});
