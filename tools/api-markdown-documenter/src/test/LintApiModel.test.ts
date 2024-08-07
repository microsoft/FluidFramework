/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "chai";

import { lintApiModel } from "../LintApiModel.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));
const testModelsDirectoryPath = Path.resolve(dirname, "..", "..", "src", "test", "test-data");

describe("lintApiModel", () => {
	it("API Model with invalid links yields the expected errors", async () => {
		const modelDirectoryPath = Path.resolve(testModelsDirectoryPath, "simple-suite-test");
		const expectedError = `API model linting failed with the following errors:
  Link errors:
    - Unable to resolve reference "BadInheritDocTarget" from "simple-suite-test#TestInterface.propertyWithBadInheritDocTarget": The member reference "BadInheritDocTarget" was not found`;

		try {
			await lintApiModel({ modelDirectoryPath });
		} catch (error: unknown) {
			expect(error).to.be.an.instanceOf(Error);
			expect((error as Error).message).to.equal(expectedError);
			return;
		}
		expect.fail("Expected an error to be thrown, but none was.");
	});

	it("Invalid model directory throws", async () => {
		const modelDirectoryPath = Path.resolve(testModelsDirectoryPath, "non-existent-directory");

		try {
			await lintApiModel({ modelDirectoryPath });
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
			await lintApiModel({ modelDirectoryPath });
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
