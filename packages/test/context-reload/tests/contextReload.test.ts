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
      // jest.setTimeout(20 * 1000);
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

      const leftDiv = await page.waitForSelector("#sbs-left");
      if (!leftDiv) {
        throw Error("no left div");
      }

      await page.waitForSelector("input.cdn");
      const cdn = await leftDiv.$(".cdn");
      if (!cdn) {
        throw Error("no cdn");
      }
      await page.evaluate((el) => {
        if (el && el instanceof HTMLInputElement) {
          el.value = "";
        }
      }, cdn);

      expect(await (await cdn.getProperty("value")).jsonValue()).toBe("");

/*
      await page.$eval("#sbs-left", (el) => {
        const cdn = el.querySelector("input.cdn");
        if (cdn && cdn instanceof HTMLInputElement) {
          cdn.value = "";
        }
      }); */

      // const input = await leftDiv.$(".cdn");
      await cdn.type(`${globals.PATH}/file`, { delay: 1 });
      expect(await (await cdn.getProperty("value")).jsonValue()).toBe(`${globals.PATH}/file`);
      console.log(await (await cdn.getProperty("value")).jsonValue());

      await page.waitForSelector("button.upgrade");
      const upgrade = await leftDiv.$("button.upgrade");
      upgrade && await upgrade.click();
      // await expect(page).toClick("button.upgrade", { text: "Upgrade Version" });

      await page.waitForSelector("button.diceroller");
      await expect(page).toClick("button.diceroller", { text: "Roll" });

      const diceValue = await getValue(0);
      const diceValue2 = await getValue(1);
      expect(diceValue).toEqual(diceValue2);
    });
  });
