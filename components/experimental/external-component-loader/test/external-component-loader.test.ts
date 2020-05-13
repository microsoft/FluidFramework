/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { globals } from "../jest.config";

describe("external-component-loader", () => {
    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load" });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    it("There's a button to be clicked", async () => {
        await expect(page).toClick("button", { text: "Add Component" });
    });

    it("can dynamically load, enable, and use itself", async () => {
        await expect(page).toFill("input", `${globals.PATH}/file/${path.join(__dirname, "../")}`);
        await expect(page).toClick("button", { text: "Add Component" });

        // wait for internal component  to be loaded
        // tslint:disable-next-line: no-string-based-set-timeout ???
        await new Promise((resolve) => setTimeout(resolve, 200));

        // enable the components by toggling edit so that the internal component can be used
        await expect(page).toClick("button", { text: "Toggle Edit" });

        // internal component div count
        const getValue = async () => {
            return page.evaluate(() => {
                const clickerElements = document.getElementsByClassName("spaces-component-view");
                return clickerElements.length;
            });
        };

        // Validate both users have 0 as their value
        const preValue = await getValue();
        expect(preValue).toEqual(2);

        // internal component button check
        const addComponentButton = await page.evaluate(async () => {
            const clickerElements = document.getElementsByClassName("spaces-component-view");
            const buttons = clickerElements[0].getElementsByTagName("button");
            return buttons[0].innerText;
        });

        expect(addComponentButton).toEqual("Add Component");
    }, 20000);
});
