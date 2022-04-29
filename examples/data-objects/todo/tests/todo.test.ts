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
                const subComponentButton = document.getElementsByName("OpenSubComponent");
                const button = subComponentButton[i] as HTMLDivElement;
                if (button) {
                    return button.id;
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

    test("todo items can be added", async () => {
        await expect(page).toFill("input[name=itemName]", "ToDoItem1");
        await expect(page).toClick("button[name=createItem]");
        await expect(page).toFill("input[name=itemName]", "ToDoItem2");
        await expect(page).toClick("button[name=createItem]");

        const result = await page.evaluate(() => {
            let itemLists = document.body.querySelectorAll(".todo-item-list");
            let items = itemLists[0].childNodes;
            return items.length === 2;
        });

        expect(result).toBeTruthy();
    });

    test("todo item can have nested clicker", async () => {
        // Add item
        await expect(page).toFill("input[name=itemName]", "ToDoClicker");
        await expect(page).toClick("button[name=createItem]");

        // Expand subitems and add clicker
        await expect(page).toClick("button[name=toggleInnerVisible]");
        await expect(page).toClick("button", { text: "clicker" });

        // Check clicker exists
        const foundClicker = await page.evaluate(() => {
            const clicker = document.body.querySelector(".clicker-value-class");
            return clicker !== null && clicker !== undefined;
        });
        expect(foundClicker).toBeTruthy();

        // Hide subitems and check clicker disappears
        await expect(page).toClick("button[name=toggleInnerVisible]");
        const hiddenClicker = await page.evaluate(() => {
            const clicker = document.body.querySelector(".clicker-value-class");
            return clicker === null || clicker === undefined;
        });
        expect(hiddenClicker).toBeTruthy();
    });

    test("todo item can nest multiple todo items", async () => {
        // Add item
        await expect(page).toFill("input[name=itemName]", "ToDoNested1");
        await expect(page).toClick("button[name=createItem]");

        // Expand subitems and add another todo item
        await expect(page).toClick("button[name=toggleInnerVisible]");
        await expect(page).toClick("button", { text: "todo" });

        // Expand sub todo subitems and add another todo item
        await expect(page).toClick(".todo-item .todo-item button[name=toggleInnerVisible]");
        await expect(page).toClick("button", { text: "todo" });

        const nestedTodo = await page.evaluate(() => {
            const todo = document.body.querySelector(".todo-item .todo-item .todo-item");
            return todo !== null && todo !== undefined;
        });
        expect(nestedTodo).toBeTruthy();
    });

    test("todo sub components routing", async () => {
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

    test("todo sub components routing for nested component", async () => {
        // Add item
        await expect(page).toFill("input[name=itemName]", "ToDoNested1");
        await expect(page).toClick("button[name=createItem]");

        // Expand subitems and add another todo item
        await expect(page).toClick("button[name=toggleInnerVisible]");
        await expect(page).toClick("button", { text: "todo" });

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
