/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { globals } from "../jest.config";

describe("external-component-loader", () => {
    jest.setTimeout(10000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
    });

    it("There's a button to be clicked", async () => {
        await expect(page).toClick("button", { text: "Add Component" });
    });

    it("can load clicker", async () => {
        await expect(page).toFill("input", `${globals.PATH}/file/${path.join(__dirname, "../..")}/clicker/`);
        await expect(page).toClick("button", { text: "Add Component" });

        // wait for clicker to be loaded
        // tslint:disable-next-line: no-string-based-set-timeout ???
        await new Promise((resolve) => setTimeout(resolve, 200));

        // clicker tests
        const getValue = async (index: number) => {
            return page.evaluate((i: number) => {
                const clickerElements = document.getElementsByClassName("clicker-value-class");
                const clicker = clickerElements[i] as HTMLDivElement;
                if (clicker) {
                    return clicker.innerText;
                }

                return "";
            }, index);
        };

        // Validate both users have 0 as their value
        const preValue = await getValue(0);
        expect(preValue).toEqual("0");
        const preValue2 = await getValue(1);
        expect(preValue2).toEqual("0");

        // Click the button
        await expect(page).toClick("button", { text: "+" });

        // Validate both users have 1 as their value
        const postValue = await getValue(0);
        expect(postValue).toEqual("1");
        const postValue2 = await getValue(1);
        expect(postValue2).toEqual("1");
    });
});
