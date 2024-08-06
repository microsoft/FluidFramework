/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "chai";

import { loadModel } from "../LoadModel.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));
const testModelsDirectoryPath = Path.resolve(dirname, "..", "..", "src", "test", "test-data");

describe("loadModel", () => {
	it("Model directory with a single API report (smoke test)", async () => {
		const modelDirectoryPath = Path.resolve(testModelsDirectoryPath, "simple-suite-test");

		// Shouldn't throw
		await loadModel({ modelDirectoryPath });
	});

	it("Invalid model directory throws", async () => {
		const modelDirectoryPath = Path.resolve(testModelsDirectoryPath, "non-existent-directory");

		try {
			await loadModel({ modelDirectoryPath });
		} catch (error: unknown) {
			expect(error).to.be.an.instanceOf(Error);
			expect((error as Error).message).to.match(/^Provided directory does not exist/);
			return;
		}
		expect.fail("Expected an error to be thrown, but none was.");
	});

	it("Empty model directory throws", async () => {
		const modelDirectoryPath = Path.resolve(testModelsDirectoryPath, "empty-model");

		try {
			await loadModel({ modelDirectoryPath });
		} catch (error: unknown) {
			expect(error).to.be.an.instanceOf(Error);
			expect((error as Error).message).to.match(
				/^No ".api.json" files found under provided directory path/,
			);
			return;
		}
		expect.fail("Expected an error to be thrown, but none was.");
	});
});
