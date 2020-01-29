/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("vltava", () => {

    beforeEach(async () => {
      await page.goto(globals.PATH, { waitUntil: "load" });
    });

    it("There's text on the page", async () => {
      await expect(page).toMatch("➕");
    });
  });
