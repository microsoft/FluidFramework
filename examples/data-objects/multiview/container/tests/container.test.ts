/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";
import { strict as assert } from "assert";

describe("CoordinateContainerRuntimeFactory", () => {
    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    it("The page loads and the expected number of slider controls are present", async () => {
        const numSliders = await page.evaluate(() => {
            return document.querySelectorAll("input[type=range]").length;
        });
        // 2 sides, 11 slider views, 2 sliders per view
        assert.strictEqual(numSliders, 44);
    });
});
