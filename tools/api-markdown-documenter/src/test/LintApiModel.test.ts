/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "chai";

import { lintApiModel, type ReferenceError, type LinterErrors } from "../LintApiModel.js";
import { loadModel } from "../LoadModel.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));
const testModelsDirectoryPath = Path.resolve(dirname, "..", "..", "src", "test", "test-data");

describe("lintApiModel", () => {
	// TODO: add case with no errors

	it("API Model with invalid links yields the expected errors", async () => {
		const modelDirectoryPath = Path.resolve(testModelsDirectoryPath, "simple-suite-test");
		const apiModel = await loadModel({ modelDirectoryPath });

		const expected: LinterErrors = {
			referenceErrors: new Set<ReferenceError>([
				// TODO: add other expected errors once they are validated
				{
					tagName: "@inheritDoc",
					sourceItem: "TestInterface.propertyWithBadInheritDocTarget",
					packageName: "simple-suite-test",
					referenceTarget: "BadInheritDocTarget",
					linkText: undefined,
				},
			]),
		};

		const result = await lintApiModel({ apiModel });

		expect(result).to.deep.equal(expected);
	});
});
