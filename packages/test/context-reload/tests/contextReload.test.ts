/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("context reload", () => {
    beforeEach(async () => {
      await page.goto(globals.PATH, { waitUntil: "load" });
    });

    it("has a button to be clicked", async () => {
        await page.waitForSelector("button.upgrade");
        await expect(page).toClick("button.upgrade", { text: "Upgrade Version" });
    });

    it("has a dice roller on the new version", async () => {
      const getValue = async (index: number) => {
        return page.evaluate((i: number) => {
            const diceElements = document.getElementsByClassName("dicevalue");
            const dice = diceElements[i] as HTMLDivElement;
            if (dice) {
                return dice.innerText;
            }

            return "";
        }, index);
      };

      await page.waitForSelector(".cdn");
      await page.$eval(".cdn", (el) => {
        if (el && el instanceof HTMLInputElement) {
          el.value = "";
        } else {
          throw Error("couldn't clear cdn");
        }
      });
      const input = await page.$(".cdn");
      if (input) {
        await input.type(`${globals.PATH}/file`, { delay: 10 });
      } else {
        throw Error("couldn't input cdn");
      }

      await page.waitForSelector("button.upgrade");
      await expect(page).toClick("button.upgrade", { text: "Upgrade Version" });
      await page.waitForSelector("button.diceroller");
      await expect(page).toClick("button.diceroller", { text: "Roll" });

      const diceValue = await getValue(0);
      const diceValue2 = await getValue(1);
      expect(diceValue).toEqual(diceValue2);
    });
  });
