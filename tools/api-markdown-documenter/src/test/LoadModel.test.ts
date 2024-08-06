/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "chai";

import { loadModel } from "../LoadModel.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));

describe("loadModel", () => {
	it("Model directory with a single API report", async () => {
		const testModelDirectoryPath = Path.resolve(
			dirname,
			"..",
			"..",
			"src",
			"test",
			"test-data",
		);

		try {
			await loadModel({ modelDirectoryPath: testModelDirectoryPath });
		} catch (error: unknown) {
			expect.fail(
				`Expected no error to be thrown, but one was: "${(error as Error)?.message}".`,
			);
		}
	});

	it("Invalid model directory throws", async () => {
		const invalidTestModelDirectoryPath = Path.resolve(
			dirname,
			"..",
			"..",
			"src",
			"test",
			"non-existent-directory",
		);

		try {
			await loadModel({ modelDirectoryPath: invalidTestModelDirectoryPath });
		} catch (error: unknown) {
			expect(error).to.be.an.instanceOf(Error);
			expect((error as Error).message).to.match(/^Provided directory does not exist/);
			return;
		}
		expect.fail("Expected an error to be thrown, but none was.");
	});
});
