/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("spaces", () => {
    jest.setTimeout(15000);
    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
    });

    it("There's a button to be clicked", async () => {
        await expect(page).toClick("button", { text: "Edit: true" });
    });
  });
