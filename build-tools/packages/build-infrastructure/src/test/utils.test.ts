/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as path from "node:path";
import { describe, it } from "mocha";

import { findGitRootSync, isInGitRepositorySync } from "../utils.js";
import { packageRootPath } from "./init.js";

describe("findGitRootSync", () => {
	it("finds root", () => {
		// This is the path to the current repo, because when tests are executed the working directory is
		const expected = path.resolve(packageRootPath, "../../..");
		const actual = findGitRootSync(process.cwd());
		assert.strictEqual(actual, expected);
	});

	// it("throws outside git repo", () => {
	// 	const testFile = path.resolve(testDataPath, "tabs/_package.json");
	// 	const [, indent] = readPackageJsonAndIndent(testFile);
	// 	const expectedIndent = "\t";
	// 	assert.strictEqual(indent, expectedIndent);
	// });
});

describe("isInGitRepository", () => {
	it("returns true in repo", () => {
		const testPath = process.cwd();
		const actual = isInGitRepositorySync(testPath);
		assert.strictEqual(actual, true);
	});

	// it("returns false outside repo", () => {
	// 	const testFile = path.resolve(testDataPath, "tabs/_package.json");
	// 	const expectedIndent = "\t";
	// 	updatePackageJsonFile(testFile, testTransformer);
	// 	const [, indent] = readPackageJsonAndIndent(testFile);
	// 	assert.strictEqual(indent, expectedIndent);
	// });
});
