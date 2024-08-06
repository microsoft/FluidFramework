/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "chai";

import { lintApiModel } from "../Linter.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));
const testModelsDirectoryPath = Path.resolve(dirname, "..", "..", "src", "test", "test-data");

describe("lintApiModel", () => {
	it("simple-suite-test", async () => {
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
});
