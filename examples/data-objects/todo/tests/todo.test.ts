/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";
import { retryWithEventualValue } from "@fluidframework/test-utils";

describe("ToDo", () => {
    const getItemUrl = async (index: number) =>
        retryWithEventualValue(
            () => page.evaluate((i: number) => {
                const openInNewTabButtons = document.querySelectorAll("button[name=OpenInNewTab]");
                const button = openInNewTabButtons[i] as HTMLDivElement;
                if (button) {
                    // TODO: Would be better to actually click the button and verify it opens in a
                    // new tab correctly.
                    return `${window.location.href}/${button.id}`;
                }

                return "";
            }, index),
            (actualValue) => actualValue.length !== 0,
            "not propagated" /* defaultValue */);

    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    test("TodoItems can be added", async () => {
        await expect(page).toFill("input[name=itemName]", "TodoItem1");
        await expect(page).toClick("button[name=createItem]");
        await expect(page).toFill("input[name=itemName]", "TodoItem2");
        await expect(page).toClick("button[name=createItem]");

        const result = await page.evaluate(() => {
            let itemLists = document.body.querySelectorAll(".todo-item-list");
            let items = itemLists[0].childNodes;
            return items.length === 2;
        });

        expect(result).toBeTruthy();
    });

    test("TodoItem has detailed text", async () => {
        // Add item
        await expect(page).toFill("input[name=itemName]", "ToDoDetails");
        await expect(page).toClick("button[name=createItem]");

        // Expand details
        await expect(page).toClick("button[name=toggleDetailsVisible]");

        // Check details exist
        const foundDetails = await page.evaluate(() => {
            const details = document.querySelector("textarea");
            return details !== null && details !== undefined;
        });
        expect(foundDetails).toBeTruthy();

        // Hide details and check they disappear
        await expect(page).toClick("button[name=toggleDetailsVisible]");
        const hiddenDetails = await page.evaluate(() => {
            const details = document.querySelector("textarea");
            return details === null || details === undefined;
        });
        expect(hiddenDetails).toBeTruthy();
    });

    test("TodoItem routing", async () => {
        await expect(page).toFill("input[name=itemName]", "ToDoItem1");
        await expect(page).toClick("button[name=createItem]");
        await expect(page).toFill("input[name=itemName]", "ToDoItem2");
        await expect(page).toClick("button[name=createItem]");

        const itemUrl = await getItemUrl(0);
        await page.goto(itemUrl, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
        const result = await page.evaluate(() => {
            let itemLists = document.body.querySelectorAll(".todo-item");
            let items = itemLists[0].childNodes;
            return items.length === 1;
        });

        expect(result).toBeTruthy();
    });
});
