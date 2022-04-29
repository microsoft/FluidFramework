/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";
import { retryWithEventualValue } from "@fluidframework/test-utils";

describe("pond", () => {
    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    it("There should be 3 buttons to be clicked", async () => {
        await expect(page).toClick("button", { text: "+1" });
        await expect(page).toClick("button", { text: "+10" });
    });

    it("Clicking the buttons updates both users", async () => {
        const getValue = async (index: number, classId: string, expectedValue: string) =>
            retryWithEventualValue(
                () => page.evaluate((index: number, classId: string) => {
                    const clickerElements = document.getElementsByClassName(classId);
                    const clicker = clickerElements[index] as HTMLDivElement;
                    if (clicker) {
                        return clicker.innerText;
                    }

                    return "";
                }, index, classId),
                (actualValue) => actualValue === expectedValue,
                "not propagated" /* defaultValue */);

        // Validate both users have 5 as their value
        const preValue_51 = await getValue(0, "clicker-value-class-5", "5");
        expect(preValue_51).toEqual("5");
        const preValue2_51 = await getValue(1, "clicker-value-class-5", "5");
        expect(preValue2_51).toEqual("5");

        // Click the +1 button
        await expect(page).toClick("button", { text: "+1" });
        // Validate both users have 6 as their value
        const postValue_51 = await getValue(0, "clicker-value-class-5", "6");
        expect(postValue_51).toEqual("6");
        const postValue2_51 = await getValue(1, "clicker-value-class-5", "6");
        expect(postValue2_51).toEqual("6");

        // Validate both users have 0 as their value
        const preValue_010 = await getValue(0, "clicker-value-class-10", "0");
        expect(preValue_010).toEqual("0");
        const preValue2_010 = await getValue(1, "clicker-value-class-10", "0");
        expect(preValue2_010).toEqual("0");

        // Click the +10 button
        await expect(page).toClick("button", { text: "+10" });
        // Validate both users have 10 as their value
        const postValue_010 = await getValue(0, "clicker-value-class-10", "10");
        expect(postValue_010).toEqual("10");
        const postValue2_010 = await getValue(1, "clicker-value-class-10", "10");
        expect(postValue2_010).toEqual("10");
    });
});
