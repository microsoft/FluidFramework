/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("diceRoller", () => {

  beforeEach(async () => {
    await page.goto(globals.PATH, { waitUntil: "load" });
  });

  it("The page loads and there's a button with Roll", async () => {
    // roll the dice 5 time to see the output
    await expect(page).toClick("button", { text: "Roll" });
  });
});
