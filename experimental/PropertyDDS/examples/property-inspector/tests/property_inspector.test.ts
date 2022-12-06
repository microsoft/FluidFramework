/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("Property Inspector", () => {
    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    it("Inspector at root1 is rendered", async () => {
        await page.waitForSelector("#sbs-left > :first-child");
    });

    it("Inspector at root2 is rendered", async () => {
        await page.waitForSelector("#sbs-right > :first-child");
    });
});
