/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { globals } from "../jest.config";

// Tests disabled -- requires Tinylicious to be running, which our test environment doesn't do.
describe("external-controller-diceRoller", () => {
    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => (window as any).fluidStarted as unknown);
    });

    it("loads and there's a button with Roll", async () => {
        // Validate there is a button that can be clicked
        await expect(page).toClick("button", { text: "Roll" });
    });
});
