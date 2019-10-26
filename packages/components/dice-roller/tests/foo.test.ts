/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

describe("foo", () => {

  beforeEach(async () => {
    await page.goto(PATH, { waitUntil: "load" });
  });

  it("page loads", async () => {
    const foo = await page.evaluate(() => {
      console.log("foo");
      return "bar";
    });
    expect(foo).toBe("bar");
  });

  it("there's a button with Roll", async () => {
    // roll the dice 5 time to see the output
    await expect(page).toClick("button", { text: "Roll" });
  });
});
