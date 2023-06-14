/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

// Tests disabled -- requires Tinylicious to be running, which our test environment doesn't do.
describe("Presence Tracker", () => {
    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        // eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-return
        await page.waitFor(() => window["fluidStarted"]);
    });

    it("Document is connected", async () => {
        await page.waitForFunction(() =>
        document.isConnected);
    });

    it("Focus Content exists", async () => {
        await page.waitForFunction(() =>
        document.getElementById("focus-content"));
    });

    it("Mouse Content exists", async () => {
        await page.waitForFunction(() =>
        document.getElementById("mouse-position"));
    });

    it("Current User is displayed", async () => {
        await page.waitForFunction(() =>
        document.getElementById("focus-div")?.innerHTML.startsWith("Current user"),
        { timeout: 10000 });
    });

    it("Current User is missing focus", async () => {
        await page.waitForFunction(() =>
        document.getElementById("focus-div")?.innerHTML.endsWith("missing focus"),
        { timeout: 10000 });
    });

    it("Current User has focus after focusing", async () => {
        await page.click("*");
        await page.waitForFunction(() =>
        document.getElementById("focus-div")?.innerHTML.endsWith("has focus"),
        { timeout: 10000 });
    });

    it("Bold when focused", async () => {
        // Click page
        await page.click("*");
        // Get font weight of cursor
        const fontWeight = await page.evaluate((className: string) => {
            const cursor = document.getElementsByClassName(className)[0] as HTMLDivElement;
            return cursor.style.fontWeight;
        }, "posDiv");
        // Check if cursor font weight is bold
        expect(fontWeight).toEqual("bold");
    });

    it("Move cursor 1", async () => {
        await page.mouse.move(0, 0);
        const pos = await page.evaluate((className: string) => {
            const cursor = document.getElementsByClassName(className)[0] as HTMLDivElement;
            return [cursor.offsetLeft, cursor.offsetTop];
        }, "posDiv");
        expect(pos[0]).toEqual(0);
        expect(pos[1]).toEqual(0);
    });

    it("Move cursor 2", async () => {
        await page.mouse.move(24, 63);
        const pos = await page.evaluate((className: string) => {
            const cursor = document.getElementsByClassName(className)[0] as HTMLDivElement;
            return [cursor.offsetLeft, cursor.offsetTop];
        }, "posDiv");
        expect(pos[0]).toEqual(24);
        expect(pos[1]).toEqual(63);
    });
});