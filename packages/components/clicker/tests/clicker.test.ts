/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

describe("foo", () => {

    beforeEach(async () => {
      await page.goto(PATH, { waitUntil: "load" });
    });

    it("There's a button that can be clicked", async () => {
      // roll the dice 5 time to see the output
      const getValue = async () => {
        return page.evaluate(() => {
            const clicker = document.getElementById("clicker-value");
            return clicker.innerText;
        });
      };

      const preValue = await getValue();
      expect(preValue).toEqual("0");
      await expect(page).toClick("button", { text: "+" });

      const postValue = await getValue();
      expect(postValue).toEqual("1");
    });

    it("Clicking the button 5 times syncs the output", async () => {
      // roll the dice 5 time to see the output
      await expect(page).toClick("button", { text: "+" });
    });
  });

  // const foo = await page.evaluate(() => {
  //   console.log("foo");
  //   return "bar";
  // });
