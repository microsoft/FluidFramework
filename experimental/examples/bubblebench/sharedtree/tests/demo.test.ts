/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("Bubblebench", () => {
    describe("SharedTree", () => {
        beforeAll(async () => {
            // Wait for the page to load first before running any tests
            // so this time isn't attributed to the first test
            await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
        }, 45000);

        beforeEach(async () => {
            await page.goto(globals.PATH, { waitUntil: "load" });
            await page.waitFor(() => window["fluidStarted"]);
        });

        it("The page loads and displays current FPS", async () => {
            // Validate there is a button that can be clicked
            await expect(page).toMatch("FPS", { timeout: 0 });
        }, 20000);
    });
});
