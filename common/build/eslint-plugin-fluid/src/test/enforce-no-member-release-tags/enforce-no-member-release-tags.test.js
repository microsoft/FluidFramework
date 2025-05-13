/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("assert");
const path = require("path");
const { ESLint } = require("eslint");

describe("Do not allow release tags on members", function () {
	function createESLintInstance() {
		const eslintConfig = {
			rules: {
				"no-member-release-tags": ["error"],
			},
			parser: "@typescript-eslint/parser",
			parserOptions: {
				project: path.join(__dirname, "../example/tsconfig.json"),
			},
		};

		return new ESLint({
			useEslintrc: false,
			overrideConfig: eslintConfig,
			rulePaths: [path.join(__dirname, "../../rules")],
		});
	}

	it("Should report errors for including release tags inside the class declaration", async function () {
		const eslint = createESLintInstance();

		const filesToLint = ["mockClassDeclaration.ts"].map((file) =>
			path.join(__dirname, "../example/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);

		const result = results[0];

		assert.strictEqual(result.errorCount, 8, "Should have 8 errors");
		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag for 'invalidInternal' at line 13 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for 'invalidAlpha' at line 18 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for 'invalidBeta' at line 23 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for 'invalidPublic' at line 28 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for 'invalidLineComment' at line 31 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for 'value' at line 50 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[6].message,
			"Including the release-tag for 'constructor' at line 57 in MockClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[7].message,
			"Including the release-tag for 'invalidInternalTwo' at line 69 in MockClassTwo is not allowed.",
		);
	});

	it("Should report errors for including release tags inside the class expression", async function () {
		const eslint = createESLintInstance();

		const filesToLint = ["mockClassExpression.ts"].map((file) =>
			path.join(__dirname, "../example/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 10, "Should have 10 errors");
		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag for 'invalidInternal' at line 13 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for 'invalidAlpha' at line 18 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for 'invalidBeta' at line 23 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for 'invalidPublic' at line 28 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for 'invalidLineComment' at line 31 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for 'invalidLineSignature' at line 34 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[6].message,
			"Including the release-tag for 'inValidSingature' at line 39 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[7].message,
			"Including the release-tag for 'constructor' at line 56 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[8].message,
			"Including the release-tag for 'value' at line 63 in mockClassExpression is not allowed.",
		);
		assert.strictEqual(
			result.messages[9].message,
			"Including the release-tag for 'invalidInternalTwo' at line 77 in mockClassExpressionTwo is not allowed.",
		);
	});

	it("Should report errors for including release tags inside the abstract class", async function () {
		const eslint = createESLintInstance();

		const filesToLint = ["mockAbstractClass.ts"].map((file) =>
			path.join(__dirname, "../example/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 2, "Should have 2 errors");
		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag for 'invalidMethodDefinition' at line 14 in MockAbstractClass is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for 'invalidPropertySignature' at line 21 in MockAbstractClass is not allowed.",
		);
	});

	it("Should report errors for including release tags inside the interface", async function () {
		const eslint = createESLintInstance();

		const filesToLint = ["mockInterface.ts"].map((file) =>
			path.join(__dirname, "../example/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 7, "Should have 7 errors");
		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag for 'invalidAlpha' at line 13 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for 'invalidBeta' at line 18 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for 'invalidPublic' at line 23 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for 'invalidInternal' at line 28 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for 'invalidInternalLine' at line 31 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for 'invalidFunction' at line 43 in MockInteface is not allowed.",
		);
		assert.strictEqual(
			result.messages[6].message,
			"Including the release-tag for 'invalidAlphaTwo' at line 55 in MockIntefaceTwo is not allowed.",
		);
	});

	it("Should report errors for including release tags inside the type", async function () {
		const eslint = createESLintInstance();

		const filesToLint = ["mockType.ts"].map((file) =>
			path.join(__dirname, "../example/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 6, "Should have 6 errors");

		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag for 'invalidTypePublic' at line 18 in MockType is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag for 'invalidTypeInternal' at line 23 in MockType is not allowed.",
		);
		assert.strictEqual(
			result.messages[2].message,
			"Including the release-tag for 'invalidTypeAlpha' at line 28 in MockType is not allowed.",
		);
		assert.strictEqual(
			result.messages[3].message,
			"Including the release-tag for 'invalidTypeBeta' at line 33 in MockType is not allowed.",
		);
		assert.strictEqual(
			result.messages[4].message,
			"Including the release-tag for 'invalidTypePublicLine' at line 36 in MockType is not allowed.",
		);
		assert.strictEqual(
			result.messages[5].message,
			"Including the release-tag for 'invalidMethod' at line 43 in MockType is not allowed.",
		);
	});

	it("Should NOT report errors for including release tags for function", async function () {
		const eslint = createESLintInstance();

		const filesToLint = ["mockFunction.ts"].map((file) =>
			path.join(__dirname, "../example/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 0, "Should have 0 error");
	});
});
