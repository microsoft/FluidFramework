/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("upgrade manager", () => {
    jest.setTimeout(10000);
    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    it("works", async () => {
        const getTitleValue = async (div: "left" | "right") => {
            return await page.$eval(`#sbs-${div} .title`, (el) => (el as HTMLParagraphElement).innerText);
        }

        const text = "fluid is really great!!!";
        await expect(page).toFill("#sbs-left .titleInput", text);
        await expect(page).toFill("#sbs-left input.cdn", `${globals.PATH}/file`);
        await expect(await page.$eval("#sbs-left input.cdn", (el) => (el as HTMLInputElement).value)).toBe(`${globals.PATH}/file`);

        const upgrade = await page.$("#sbs-left button.upgradeViaManager");
        upgrade && await upgrade.click();

        await page.waitForSelector("button.diceRoller");
        await expect(await getTitleValue("left")).toEqual(await getTitleValue("right"));
        await expect(await getTitleValue("left")).toEqual(text);
    })
});
