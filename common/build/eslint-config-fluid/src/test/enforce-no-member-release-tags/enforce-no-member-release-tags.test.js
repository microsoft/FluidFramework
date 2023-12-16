/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const assert = require("assert");
const path = require("path");
const { ESLint } = require("eslint");

describe("ESLint No Release Tag Rule Tests", function () {
	function createESLintInstance(config) {
		return new ESLint({
			useEslintrc: false,
			overrideConfig: config,
			rulePaths: [path.join(__dirname, "../../custom-rules")],
		});
	}

	it("Should report errors for including release tags inside the class declaration", async function () {
		const eslint = createESLintInstance({
			rules: {
				"no-member-release-tags": ["error"],
			},
			parser: "@typescript-eslint/parser",
			parserOptions: {
				project: path.join(__dirname, "../tsconfig.json"),
			},
		});
		const filesToLint = ["mockClassDeclaration.ts"].map((file) =>
			path.join(__dirname, ".././mockFiles/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 9, "Should have 9 errors");
		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag for invalidInternal at line 18 is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for invalidAlpha at line 23 is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for inValidBeta at line 28 is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for inValidPublic at line 33 is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for invalidLineComment at line 36 is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for invalidInternal at line 58 is not allowed.",
		);
		assert.strictEqual(
			result.messages[6].message,
			"Including the release-tag for invalidAlpha at line 63 is not allowed.",
		);
		assert.strictEqual(
			result.messages[7].message,
			"Including the release-tag for inValidPublic at line 68 is not allowed.",
		);
		assert.strictEqual(
			result.messages[8].message,
			"Including the release-tag for invalidSignature at line 73 is not allowed.",
		);
	});

	it.only("Should report errors for including release tags inside the class expression", async function () {
		const eslint = createESLintInstance({
			rules: {
				"no-member-release-tags": ["error"],
			},
			parser: "@typescript-eslint/parser",
			parserOptions: {
				project: path.join(__dirname, "../tsconfig.json"),
			},
		});
		const filesToLint = ["mockClassExpression.ts"].map((file) =>
			path.join(__dirname, ".././mockFiles/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 7, "Should have 7 errors");
		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag for invalidInternal at line 13 is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for invalidAlpha at line 18 is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for inValidBeta at line 23 is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for inValidPublic at line 28 is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for invalidLineComment at line 31 is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for invalidLineSignature at line 34 is not allowed.",
		);
		assert.strictEqual(
			result.messages[6].message,
			"Including the release-tag for inValidSingature at line 39 is not allowed.",
		);
	});

	it("Should report an error for including release tags inside the abstract class.", async function () {
		const eslint = createESLintInstance({
			rules: {
				"no-member-release-tags": ["error"],
			},
			parser: "@typescript-eslint/parser",
			parserOptions: {
				project: path.join(__dirname, "../tsconfig.json"),
			},
		});
		const filesToLint = ["mockAbstractClass.ts"].map((file) =>
			path.join(__dirname, ".././mockFiles/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 1, "Should have 1");
		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag inside the mockClassExpression at line 9 is not allowed.",
		);
	});

	it("Should report errors for including release tags inside the interface", async function () {
		const eslint = createESLintInstance({
			rules: {
				"no-member-release-tags": ["error"],
			},
			parser: "@typescript-eslint/parser",
			parserOptions: {
				project: path.join(__dirname, "../tsconfig.json"),
			},
		});
		const filesToLint = ["mockInterface.ts"].map((file) =>
			path.join(__dirname, ".././mockFiles/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 7, "Should have 7 errors");
		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag for invalidAlpha at line 16 is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for invalidBeta at line 21 is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for invalidPublic at line 26 is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for invalidInternal at line 31 is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for invalidInternalLine at line 34 is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for invalidFunction at line 46 is not allowed.",
		);
		assert.strictEqual(
			result.messages[6].message,
			"Including the release-tag for invalidAlpha at line 56 is not allowed.",
		);
	});

	it("Should report errors for including release tags inside the type", async function () {
		const eslint = createESLintInstance({
			rules: {
				"no-member-release-tags": ["error"],
			},
			parser: "@typescript-eslint/parser",
			parserOptions: {
				project: path.join(__dirname, "../tsconfig.json"),
			},
		});
		const filesToLint = ["mockType.ts"].map((file) =>
			path.join(__dirname, ".././mockFiles/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 6, "Should have 6 errors");

		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag for invalidTypePublic at line 21 is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for invalidTypeInternal at line 26 is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for invalidTypeAlpha at line 31 is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for invalidTypeBeta at line 36 is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for invalidTypePublicLine at line 39 is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for invalidMethod at line 46 is not allowed.",
		);
	});
});
