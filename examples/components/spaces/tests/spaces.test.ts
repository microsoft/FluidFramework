/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("spaces", () => {

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
    }, 10000);

    it("There's a button to be clicked", async () => {
        jest.setTimeout(10000);
        await expect(page).toClick("button", { text: "Edit: true" });
    }, 10000);
  });
