/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import config from "../jest.config.cjs";

let url;

describe("brainstorm", () => {
	const load = async () => {
		await page.goto(config.globals.URL, {
			waitUntil: ["networkidle2", "load"],
			timeout: 20000,
		});
	};

	beforeEach(async () => {
		await load();
		expect(await page.title()).toBe("Brainstorm Demo");
		url = await page.url();
	});

	it("Load the container", async () => {
		console.log("Container URL---", url);
		await page.goto(url, { waitUntil: "domcontentloaded" });
	});
});
