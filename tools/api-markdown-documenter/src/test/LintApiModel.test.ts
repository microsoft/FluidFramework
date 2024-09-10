/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import { ApiModel } from "@microsoft/api-extractor-model";
import { expect } from "chai";

import { lintApiModel, type LinterErrors } from "../LintApiModel.js";
import { loadModel } from "../LoadModel.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));
const testModelsDirectoryPath = Path.resolve(dirname, "..", "..", "src", "test", "test-data");

describe("lintApiModel", () => {
	it("Empty API Model yields no errors", async () => {
		const apiModel = new ApiModel();
		const result = await lintApiModel({ apiModel });

		expect(result).to.be.undefined;
	});

	it("API Model with invalid links yields the expected errors", async () => {
		const modelDirectoryPath = Path.resolve(testModelsDirectoryPath, "simple-suite-test");

		const apiModel = await loadModel({ modelDirectoryPath });

		const expected: LinterErrors = {
			referenceErrors: new Set([
				{
					tagName: "@link",
					sourceItem: "", // link appears in package documentation
					packageName: "test-suite-a",
					referenceTarget: "InvalidItem",
					linkText: undefined,
				},
				{
					tagName: "@link",
					sourceItem: "", // link appears in package documentation
					packageName: "test-suite-a",
					referenceTarget: "InvalidItem",
					linkText:
						"even though I link to an invalid item, I would still like this text to be rendered",
				},
				{
					tagName: "@inheritDoc",
					sourceItem: "TestInterface.propertyWithBadInheritDocTarget",
					packageName: "test-suite-a",
					referenceTarget: "BadInheritDocTarget",
					linkText: undefined,
				},
			]),
		};

		const result = await lintApiModel({ apiModel });

		expect(result).to.deep.equal(expected);
	});
});
