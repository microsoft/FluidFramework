/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("context reload", () => {
    jest.setTimeout(10000);
    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    it("retains previous data", async () => {
        const getTitleValue = async () => {
            const text = await page.$eval(`.title`, (el) => (el as HTMLParagraphElement).innerText);
            return text;
        }

        const getValueByDivId = async (index: number) => {
            return page.evaluate((i: number) => {
                const div = document.getElementsByName("urltext");
                const text = div[0] as HTMLTextAreaElement;
                if (text) {
                    return text.textContent;
                }

                return "haha";
            }, index);
        };

        const text = "fluid is really great!!!";
        await expect(page).toFill(".titleInput", text);
        await expect(page).toClick("button[name=attach-button]");
        const prevText = await getTitleValue();
        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
        await delay(1000);
        const newContainerUrl = await getValueByDivId(0);
        console.log("url ", newContainerUrl);
        await page.goto(newContainerUrl, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
        expect(await getTitleValue()).toEqual(prevText);
    })
});
