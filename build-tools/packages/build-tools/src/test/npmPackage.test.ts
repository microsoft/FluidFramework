/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as path from "node:path";

import { PackageJson, readPackageJsonAndIndent } from "../common/npmPackage";
import { testDataPath } from "./init";

/**
 * A transformer function that does nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const testTransformer = (json: PackageJson) => {
	// do nothing
	return;
};

describe("readPackageJsonAndIndent", () => {
	it("detects spaces indentation", () => {
		const testFile = path.resolve(testDataPath, "spaces/_package.json");
		const [, indent] = readPackageJsonAndIndent(testFile);
		const expectedIndent = "  ";
		assert.strictEqual(indent, expectedIndent);
	});

	it("detects tabs indentation", () => {
		const testFile = path.resolve(testDataPath, "tabs/_package.json");
		const [, indent] = readPackageJsonAndIndent(testFile);
		const expectedIndent = "\t";
		assert.strictEqual(indent, expectedIndent);
	});
});
