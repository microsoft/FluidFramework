/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("vltava", () => {
    jest.setTimeout(10000);
    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    it("There's text on the page", async () => {
        await expect(page).toMatch("➕");
    });
});
