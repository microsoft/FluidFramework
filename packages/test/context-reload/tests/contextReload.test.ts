/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("context reload", () => {
    beforeEach(async () => {
      await page.goto(globals.PATH, { waitUntil: "load" });
    });

    // it("has a button to be clicked", async () => {
    //     await page.waitForSelector("button.upgrade");
    //     await expect(page).toClick("button.upgrade", { text: "Upgrade Version" });
    // });

    it("has a dice roller on the new version", async () => {
      // jest.setTimeout(20 * 1000);
      const getDiceValue = async (div: "left" | "right") => {
        return await page.$eval(`#sbs-${div} .dicevalue`, (el) => (el as HTMLDivElement).innerText);
      }

      await expect(page).toFill("#sbs-left input.cdn", `${globals.PATH}/file`);
      await expect(await page.$eval("#sbs-left input.cdn", (el) => (el as HTMLInputElement).value)).toBe(`${globals.PATH}/file`);

      const upgrade = await page.$("#sbs-left button.upgrade");
      upgrade && await upgrade.click();

      await page.waitForSelector("button.diceroller");
      await expect(page).toClick("button.diceroller", { text: "Roll" });

      await expect(await getDiceValue("left")).toEqual(await getDiceValue("right"));
    });
  });
