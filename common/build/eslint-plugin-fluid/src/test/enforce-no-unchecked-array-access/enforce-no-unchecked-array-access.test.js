/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("assert");
const path = require("path");
const { ESLint } = require("eslint");

describe("ESLint Rule Tests", function () {
	function createESLintInstance(config) {
		return new ESLint({
			useEslintrc: false,
			overrideConfig: config,
			rulePaths: [path.join(__dirname, "../../rules")],
		});
	}

	it("Should report an error for unchecked record access but not array access", async function () {
		const eslint = createESLintInstance({
			rules: {
				"no-unchecked-array-access": "error",
			},
			parser: "@typescript-eslint/parser",
			parserOptions: {
				project: path.join(__dirname, "../tsconfig.json"),
			},
		});
		const filesToLint = ["fileWithArrayAndRecordAccess.ts"].map((file) =>
			path.join(__dirname, "../mockFiles/no-unchecked-array-access", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 1, "Should have one error");
		assert.strictEqual(
			result.messages[0].message,
			"Unchecked access to a record index detected.",
		);
	});

	it("Should not report an error for valid array access", async function () {
		const eslint = createESLintInstance({
			rules: {
				"no-unchecked-array-access": "error",
			},
			parser: "@typescript-eslint/parser",
			parserOptions: {
				project: path.join(__dirname, "../tsconfig.json"),
			},
		});
		const filesToLint = ["fileWithOnlyArrayAccess.ts"].map((file) =>
			path.join(__dirname, "../mockFiles/no-unchecked-array-access", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];

		assert.strictEqual(result.errorCount, 0, "Should have no errors");
	});
});
