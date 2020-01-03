/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ElementHandle } from "puppeteer";
import { globals } from "../jest.config";

describe("canvas", () => {
    beforeEach(async () => {
        await page.goto(globals.PATH, { waitUntil: "load" });
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

        // compare canvases
        const getImage = async (index: number): Promise<number[]> => {
            return page.evaluate((i) => {
                const canvases = document.querySelectorAll("canvas");

                // use min dimensions to avoid problems from canvases of slightly mismatched sizes
                const w = Math.min(...Array.from(canvases).map((c) => c.getBoundingClientRect().width));
                const h = Math.min(...Array.from(canvases).map((c) => c.getBoundingClientRect().height));

                // page.evaluate() will serialize this to JSON so we filter out nonzero values to make it faster
                return Array.from(canvases[i].getContext("2d").getImageData(0, 0, w, h).data).filter((e) => e > 0);
            }, index);
        };

        const imgs = await Promise.all([getImage(0), getImage(1)]);
        expect(imgs[0]).toEqual(expect.anything());
        expect(imgs[1]).toEqual(expect.anything());

        // make sure we didn't get empty image data on accident
        expect(imgs[0].length).not.toEqual(0);
        expect(imgs[1].length).not.toEqual(0);

        expect(imgs[0]).toEqual(imgs[1]);
    });
});
