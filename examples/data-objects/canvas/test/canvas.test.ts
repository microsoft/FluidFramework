/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ElementHandle } from "puppeteer";
import { globals } from "../jest.config";

describe("canvas", () => {
    beforeAll(async () => {
        // Wait for the page to load first before running any tests
        // so this time isn't attributed to the first test
        await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
    }, 45000);

    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
        await page.waitFor(() => window["fluidStarted"]);
    });

    it("can be drawn upon with a computer mouse input peripheral", async () => {
        // draw on the canvas
        await page.waitForSelector("canvas");
        const canvas: ElementHandle = await page.$("canvas");
        const boundingBox = await canvas.boundingBox();
        await page.mouse.move(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(126, 19);
        await page.mouse.up();
        await page.waitFor(() => window["FluidLoader"].isSynchronized());

        // compare canvases
        const result = await page.evaluate(() => {
            const canvases = Array.from(document.querySelectorAll("canvas"));

            // use min dimensions to avoid problems from canvases of slightly mismatched sizes
            const width = Math.min(...canvases.map((c) => c.width));
            const height = Math.min(...canvases.map((c) => c.height));

            const imgs = canvases.map((c) => c.getContext("2d").getImageData(0, 0, width, height).data);
            if (imgs[0].length == 0) {
                return "Canvas 1 doesn't have any pixels";
            }
            if (imgs[1].length == 0) {
                return "Canvas 2 doesn't have any pixels";
            }

            const diff: { index: number, value1: number, value2: number }[] = [];
            imgs[0].forEach((value, index) => {
                if (imgs[1][index] !== value) {
                    diff.push({index, value1: value, value2: imgs[1][index]});
                }
            });
            return diff;
        });

        expect(result).toEqual([]);
    });
});
