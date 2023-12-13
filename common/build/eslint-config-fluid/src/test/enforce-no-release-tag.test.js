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
			rulePaths: [path.join(__dirname, "../custom-rules")],
		});
	}

	it("Should report an error for restricted tag imports", async function () {
		const eslint = createESLintInstance({
			rules: {
				"no-release-tags": ["error"],
			},
			parser: "@typescript-eslint/parser",
			parserOptions: {
				project: path.join(__dirname, "./tsconfig.json"),
			},
		});
		const filesToLint = ["noReleaseTagMockClass.ts"].map((file) =>
			path.join(__dirname, "mockFiles", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 4, "Should have four errors");
		assert.strictEqual(
			result.messages[0].message,
			"Including the release-tag inside the MockClass at line 9 is not allowed.",
		);
	});
});
