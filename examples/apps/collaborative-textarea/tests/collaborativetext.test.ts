/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("collaborativetext", () => {
    const getValue = async (index: number) => {
        return page.evaluate((i: number) => {
            const divs = document.getElementsByClassName("text-area");
            const textAreaElements = divs[i].getElementsByTagName("textarea");
            const textarea = textAreaElements[0] as HTMLTextAreaElement;
            if (textarea) {
                return textarea.value;
            }

            return "-----undefined-----";
        }, index);
    };

    const setText = async (index: number, text: string) => {
        return page.evaluate((i: number, t:string) => {
            const divs = document.getElementsByClassName("text-area");
            const textAreaElements = divs[i].getElementsByTagName("textarea");
            const textarea = textAreaElements[0] as HTMLTextAreaElement;
            if (textarea) {
                textarea.focus()
                textarea.setRangeText(t);
                textarea.setSelectionRange(t.length, t.length);

                // We need to trigger an event since setting the text range directly
                // doesn't cause an update.
                const ev = document.createEvent('HTMLEvents');
                ev.initEvent('input', true, false);
                textarea.dispatchEvent(ev)
            }
        }, index, text);
    };

    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
        await page.waitForSelector(".text-area");
    });

    it("Initial textarea is empty", async () => {
        const ta1 = await getValue(0);
        expect(ta1).toEqual("");

        const ta2 = await getValue(1);
        expect(ta2).toEqual("");
    });

    it("User1 types hello", async () => {
        const ta1 = await getValue(0);
        expect(ta1).toEqual("");

        setText(0, "hello");

        await page.waitForFunction( async () => {
                const divs = document.getElementsByClassName("text-area");
                const textAreaElements = divs[0].getElementsByTagName("textarea");
                const textarea = textAreaElements[0] as HTMLTextAreaElement;
                if (textarea) {
                    return textarea.value.includes("hello");
                }
            }, { timeout: 1000 }
        );

        const ta12 = await getValue(0);
        expect(ta12).toEqual("hello");

        const ta2 = await getValue(1);
        expect(ta2).toEqual("hello");
    });
});
