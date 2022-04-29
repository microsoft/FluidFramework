/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("sharedText", () => {
    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    test("The title of the document is the same for both users", async () => {
        const getTitles = async (index: number) => {
            return page.evaluate((i: number) => {
                const titleElements = document.getElementsByClassName("title-bar");
                const title = titleElements[i] as HTMLDivElement;
                if (title) {
                    return title.innerText;
                }

                return "";
            }, index);
        }

        // Get the titles of the two documents and verify they are the same.
        const titleLeft = await getTitles(0);
        expect(titleLeft).not.toEqual("");

        const titleRight = await getTitles(1);
        expect(titleLeft).toEqual(titleRight);
    });
    test("the text typed by one user updates the text for the other user", async () => {
        const getText = async (index: number) => {
            return page.evaluate((i: number) => {
                const titleElements = document.getElementsByClassName("flow-view");
                const title = titleElements[i] as HTMLDivElement;
                if (title) {
                    let text = "";
                    // all content is stored in spans, and presence is stored in divs
                    // we only want content here
                    title.querySelectorAll("span").forEach((span) => text += span.innerText);
                    return text;
                }

                return "";
            }, index);
        }


        const word: string = "sharedTextTest";
        // Issue #5331:  Generate synthetic events on the client side to improve stability instead of using page.type
        await page.evaluate((word: string) => {
            for (const c of word) {
                // Type a word in one of the documents. There are two classes with name "flow-view",
                // one for each user. This will pick the first class it finds and type in that.
                document.body.dispatchEvent(new KeyboardEvent("keypress", { charCode: c.charCodeAt(0) } as any));
            }
        }, word);

        // wait for all changes to propagate
        await page.waitFor(() => window["FluidLoader"].isSynchronized());

        // The text returned has extra spaces so remove the extra spaces
        let textLeft = await getText(0);
        expect(textLeft).not.toEqual("");
        textLeft = textLeft.replace(/\s/g, '');

        let textRight = await getText(1);
        expect(textRight).not.toEqual("");
        textRight = textRight.replace(/\s/g, '');

        // Verify that the text updated for both the users.
        expect(textLeft).toEqual(word);
        expect(textRight).toEqual(word);
    });

});
