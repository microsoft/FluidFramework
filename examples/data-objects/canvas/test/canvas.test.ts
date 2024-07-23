/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config.cjs";

describe("canvas", () => {
	beforeAll(async () => {
		// Wait for the page to load first before running any tests
		// so this time isn't attributed to the first test
		await page.goto(globals.PATH, { waitUntil: "load", timeout: 0 });
		await page.waitForFunction(() => window["fluidStarted"]);
	}, 45000);

	beforeEach(async () => {
		await page.goto(globals.PATH, { waitUntil: "load" });
		await page.waitForFunction(() => window["fluidStarted"]);
	});

	it("can be drawn upon with a computer mouse input peripheral", async () => {
		// draw on the canvas
		await page.waitForSelector("canvas");
		const canvas = await page.$("canvas");
		expect(canvas).not.toBe(null);
		if (canvas === null) {
			throw new Error("Canvas not found");
		}
		const boundingBox = await canvas.boundingBox();
		expect(boundingBox).not.toBe(null);
		if (boundingBox === null) {
			throw new Error("Bounding box not defined");
		}
		await page.mouse.move(
			boundingBox.x + boundingBox.width / 2,
			boundingBox.y + boundingBox.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(126, 19);
		await page.mouse.up();

		// compare canvases
		const result = await page.evaluate(async () => {
			const canvases = Array.from(document.querySelectorAll("canvas"));

			// use min dimensions to avoid problems from canvases of slightly mismatched sizes
			const width = Math.min(...canvases.map((c) => c.width));
			const height = Math.min(...canvases.map((c) => c.height));

			// Compares the two canvases and returns an array of each different pixel
			const imageDiff = () => {
				const imgs = canvases.map((c) => {
					const context = c.getContext("2d");
					if (context === null) {
						throw new Error("Failed to get 2d context");
					}
					return context.getImageData(0, 0, width, height).data;
				});
				if (imgs[0].length == 0) {
					return "Canvas 1 doesn't have any pixels";
				}
				if (imgs[1].length == 0) {
					return "Canvas 2 doesn't have any pixels";
				}

				const diff: { index: number; value1: number; value2: number }[] = [];
				imgs[0].forEach((value, index) => {
					if (imgs[1][index] !== value) {
						diff.push({ index, value1: value, value2: imgs[1][index] });
					}
				});
				return diff;
			};

			let timedOut = false;

			// It may take some time for changes to propagate from the drawing canvas to the receiving canvas.
			// This promise will resolve after the receiving canvas matches (or never, if there is a bug and they
			// don't converge).
			const imagesMatchP = new Promise<void>((resolve) => {
				const checkAndMaybeQueue = () => {
					const diffResult = imageDiff();
					if (diffResult.length === 0) {
						resolve();
					} else if (!timedOut) {
						// Only queue for another check if we aren't already failed due to timeout.
						requestAnimationFrame(checkAndMaybeQueue);
					}
				};
				checkAndMaybeQueue();
			});

			// We expect imagesMatchP to resolve in a reasonable amount of time.
			const timeoutP = new Promise<void>((resolve) =>
				setTimeout(() => {
					resolve();
					timedOut = true;
				}, 1000),
			);

			await Promise.race([imagesMatchP, timeoutP]);

			// Regardless of whether we got a match or timed out, return the diff.
			return imageDiff();
		});

		expect(result).toEqual([]);
	});
});
