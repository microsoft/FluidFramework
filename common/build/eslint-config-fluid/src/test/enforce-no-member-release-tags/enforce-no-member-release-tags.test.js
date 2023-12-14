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

	it("Should report an error for including release tags inside the class.", async function () {
		const eslint = createESLintInstance({
			rules: {
				"no-member-release-tags": ["error"],
			},
			parser: "@typescript-eslint/parser",
			parserOptions: {
				project: path.join(__dirname, "../tsconfig.json"),
			},
		});
		const filesToLint = ["mockClass.ts"].map((file) =>
			path.join(__dirname, ".././mockFiles/no-member-release-tags", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 2, "Should have 2 errors");
		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag inside the MockClass at line 9 is not allowed.",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Including the release-tag inside the MockClassTwo at line 47 is not allowed.",
		);
	});

	it("Should report an error for including release tags inside the class expression.", async function () {
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
		assert.strictEqual(result.errorCount, 1, "Should have 1");
		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag inside the mockClassExpression at line 9 is not allowed.",
		);
	});
});
