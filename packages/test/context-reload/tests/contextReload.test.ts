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
        await expect(page).toClick("button", { text: "Upgrade Version" });
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

      const input = await page.$(".cdn");
      if (input) {
        await input.click({ clickCount: 3 }); // select all
        await input.type(`${globals.PATH}/file`);
      }

      await expect(page).toClick("button", { text: "Upgrade Version" });
      await expect(page).toClick("button", { text: "Roll" });

      const diceValue = await getValue(0);
      const diceValue2 = await getValue(1);
      expect(diceValue).toEqual(diceValue2);
    });
  });
