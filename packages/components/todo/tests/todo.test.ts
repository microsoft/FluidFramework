/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("ToDo", () => {
    jest.setTimeout(15000);

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
});
