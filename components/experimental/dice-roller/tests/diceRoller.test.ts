/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("diceRoller", () => {
    jest.setTimeout(10000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    it("The page loads and there's a button with Roll", async () => {
        // Validate there is a button that can be clicked
        await expect(page).toClick("button", { text: "Roll" });
    });
});
