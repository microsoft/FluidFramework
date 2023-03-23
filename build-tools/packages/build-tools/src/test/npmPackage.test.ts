/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import * as path from "node:path";

import { PackageJson, readPackageJsonAndIndent, updatePackageJsonFile } from "../common/npmPackage";

/**
 * Path to the test data. It's rooted two directories up because the tests get executed from dist/.
 */
const testDataPath = path.resolve(__dirname, "../../src/test/data");

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

describe("updatePackageJsonFile", () => {
	it("outputs file with spaces", () => {
		const testFile = path.resolve(testDataPath, "spaces/_package.json");
		const expectedIndent = "  ";
		updatePackageJsonFile(testFile, testTransformer);
		const [, indent] = readPackageJsonAndIndent(testFile);
		assert.strictEqual(indent, expectedIndent);
	});

	it("outputs file with tabs", () => {
		const testFile = path.resolve(testDataPath, "tabs/_package.json");
		const expectedIndent = "\t";
		updatePackageJsonFile(testFile, testTransformer);
		const [, indent] = readPackageJsonAndIndent(testFile);
		assert.strictEqual(indent, expectedIndent);
	});
});
