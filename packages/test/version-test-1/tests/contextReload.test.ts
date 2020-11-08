/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import { globals } from "../jest.config";

describe("context reload", () => {
    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load" });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => (window as any).fluidStarted as boolean);
    });

    it("retains previous data", async () => {
        const getTitleValue = async (div: "left" | "right") => {
            return page.$eval(`#sbs-${div} .title`,
                (el) => (el as HTMLParagraphElement).innerText);
        };

        const text = "fluid is really great!!!";
        await expect(page).toFill("#sbs-right .titleInput", text);
        await expect(page).toFill("#sbs-right input.cdn", `${globals.PATH}/file`);
        expect(
            await page.$eval("#sbs-right input.cdn", (el) => (el as HTMLInputElement).value),
        ).toBe(`${globals.PATH}/file`);

        const upgrade = await page.$("#sbs-right button.upgrade");
        await upgrade?.click();

        await page.waitForSelector("button.diceRoller");
        expect(await getTitleValue("right")).toEqual(await getTitleValue("left"));
        expect(await getTitleValue("right")).toEqual(text);
    });

    it("has a dice roller on the new version", async () => {
        const getDiceValue = async (div: "left" | "right") => {
            return page.$eval(`#sbs-${div} .diceValue`, (el) => (el as HTMLDivElement).innerText);
        };

        await expect(page).toFill("#sbs-right input.cdn", `${globals.PATH}/file`);
        expect(
            await page.$eval("#sbs-right input.cdn", (el) => (el as HTMLInputElement).value),
        ).toBe(`${globals.PATH}/file`);

        const upgrade = await page.$("#sbs-right button.upgrade");
        await upgrade?.click();

        await page.waitForSelector("button.diceRoller");
        await expect(page).toClick("button.diceRoller", { text: "Roll" });

        expect(
            await getDiceValue("right"),
        ).toEqual(await getDiceValue("left"));
    });

    it("is followed by an immediate summary", async () => {
        await page.evaluate(() => localStorage.debug = "fluid:telemetry:Summarizer");
        // await page.reload({ waitUntil: "load" });
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.evaluate(() => localStorage.debug = undefined);

        await page.waitFor(() => (window as any).fluidStarted as boolean);

        const summMessage = new Deferred<void>();
        page.on("console", (msg) => {
            if (/Summarizing_end.*message.*immediate/.test(msg.text())) {
                summMessage.resolve();
            }
        });

        await expect(page).toFill("#sbs-right input.cdn", `${globals.PATH}/file`);
        expect(
            await page.$eval("#sbs-right input.cdn", (el) => (el as HTMLInputElement).value),
        ).toBe(`${globals.PATH}/file`);

        const upgrade = await page.$("#sbs-right button.upgrade");
        await upgrade?.click();

        await summMessage.promise;
    });
});
