/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config.cjs";

describe.skip("Integration Tests", () => {
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

	it("The page loads", async () => {
		// await expect(page).toClick("button", { text: "Roll" });
	});
});

describe("Unit tests", () => {
	// Demonstrates use with high level service-client container API's like AzureClient and OdspClient.
	it("treeDataObject works with container schema", () => {
		// TODO: There is no service implementation agnostic client abstraction that can be referred to here (ex: shared by AzureClient and OdspClient).
		// This makes documenting compatibility with that implicit common API difficult.
		// It also makes writing service agnostic code at that abstraction level harder.
		// This should be fixed.
		//
		// TODO:
		// Writing an app at this abstraction level currently requires a lot of boilerplate which also requires extra dependencies.
		// Since `@fluid-example/example-utils` doesn't provide that boilerplate and neither do the public packages, there isn't a concise way to actually use this container in this example.
		// This should be fixed.
		//
		// TODO:
		// The commonly used boilerplate for setting up a ContainerSchema based application configures the dev-tools, which would be great to include in this example,
		// but can't be included due to dependency layering issues.
		//
		// TODO: THis test setup fails to import files from src, and also errors on unused values, so this can't be enabled.
		// const containerSchema = {
		// 	initialObjects: {
		// 		// TODO: it seems odd that DataObjects in container schema need both a key under initialObjects where they are,
		// 		// as well as a key under the root data object, and SharedObjects only need one key.
		// 		tree: treeDataObject("tree", treeConfiguration),
		// 	},
		// } satisfies ContainerSchema;
	});
});
