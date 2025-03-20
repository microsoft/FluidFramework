/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as path from "node:path";

import { describe, it } from "mocha";

import {
	readPackageJsonAndIndent,
	updatePackageJsonFile,
	updatePackageJsonFileAsync,
} from "../packageJsonUtils.js";
import { type PackageJson } from "../types.js";

import { testDataPath } from "./init.js";

/**
 * A transformer function that does nothing.
 */
const testTransformer = (json: PackageJson): void => {
	// do nothing
	return;
};

/**
 * A transformer function that does nothing.
 */
const testTransformerAsync = async (json: PackageJson): Promise<void> => {
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
	it("keeps indentation style in file with spaces", () => {
		const testFile = path.resolve(testDataPath, "spaces/_package.json");
		const expectedIndent = "  ";
		updatePackageJsonFile(testFile, testTransformer);
		const [, indent] = readPackageJsonAndIndent(testFile);
		assert.strictEqual(indent, expectedIndent);
	});

	it("keeps indentation style in file with tabs", () => {
		const testFile = path.resolve(testDataPath, "tabs/_package.json");
		const expectedIndent = "\t";
		updatePackageJsonFile(testFile, testTransformer);
		const [, indent] = readPackageJsonAndIndent(testFile);
		assert.strictEqual(indent, expectedIndent);
	});
});

describe("updatePackageJsonFileAsync", () => {
	it("keeps indentation style in file with spaces", async () => {
		const testFile = path.resolve(testDataPath, "spaces/_package.json");
		const expectedIndent = "  ";
		await updatePackageJsonFileAsync(testFile, testTransformerAsync);
		const [, indent] = readPackageJsonAndIndent(testFile);
		assert.strictEqual(indent, expectedIndent);
	});

	it("keeps indentation style in file with tabs", async () => {
		const testFile = path.resolve(testDataPath, "tabs/_package.json");
		const expectedIndent = "\t";
		await updatePackageJsonFileAsync(testFile, testTransformerAsync);
		const [, indent] = readPackageJsonAndIndent(testFile);
		assert.strictEqual(indent, expectedIndent);
	});
});
