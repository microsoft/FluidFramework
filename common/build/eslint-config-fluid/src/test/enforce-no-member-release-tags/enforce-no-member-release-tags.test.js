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
			"Including the release-tag for invalidInternal at line 13 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for invalidAlpha at line 18 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for inValidBeta at line 23 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for inValidPublic at line 28 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for invalidLineComment at line 31 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for invalidInternal at line 53 in MockClassTwo is not allowed.",
		);
		assert.strictEqual(
			result.messages[6].message,
			"Including the release-tag for invalidAlpha at line 58 in MockClassTwo is not allowed.",
		);
		assert.strictEqual(
			result.messages[7].message,
			"Including the release-tag for inValidPublic at line 63 in MockClassTwo is not allowed.",
		);
		assert.strictEqual(
			result.messages[8].message,
			"Including the release-tag for invalidSignature at line 68 in MockClassTwo is not allowed.",
		);
	});

	it("Should report errors for including release tags inside the class expression", async function () {
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
			"Including the release-tag for invalidInternal at line 13 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for invalidAlpha at line 18 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for inValidBeta at line 23 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for inValidPublic at line 28 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for invalidLineComment at line 31 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for invalidLineSignature at line 34 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[6].message,
			"Including the release-tag for inValidSingature at line 39 in mockClassExpression is not allowed.",
		);
	});

	// Skipping as the ESLint plug-in is not recognizing `abstract class` to objects inside the `context` method. 
	// TODO: Need to support `abstract class` for the linter.   
	it.skip("Should report errors for including release tags inside the abstract class", async function () {
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
			"Including the release-tag for invalidAlpha at line 13 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for invalidBeta at line 18 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for invalidPublic at line 23 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for invalidInternal at line 28 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for invalidInternalLine at line 31 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for invalidFunction at line 43 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[6].message,
			"Including the release-tag for invalidAlpha at line 53 in MockIntefaceTwo is not allowed.",
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
			"Including the release-tag for invalidTypePublic at line 18 in MockType is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for invalidTypeInternal at line 23 in MockType is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for invalidTypeAlpha at line 28 in MockType is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for invalidTypeBeta at line 33 in MockType is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for invalidTypePublicLine at line 36 in MockType is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for invalidMethod at line 43 in MockType is not allowed.",
		);
	});
});
