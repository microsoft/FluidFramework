/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("foo", () => {

    beforeEach(async () => {
      await page.goto(globals.PATH, { waitUntil: "load" });
    });

    it("There's a button that can be clicked", async () => {
      // roll the dice 5 time to see the output
      const getValue = async () => {
        return page.evaluate(() => {
            const clickerElements = document.getElementsByClassName("clicker-value-class");
            const clicker = document.getElementById(clickerElements[0].id);
            if (clicker) {
                return clicker.innerText;
            }

            return "";
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
