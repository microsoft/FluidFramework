/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("assert");
const path = require("path");
const { ESLint } = require("eslint");

describe("Do not allow Markdown links in JSDoc/TSDoc comments", function () {
	async function lintFile(file) {
		const eslint = new ESLint({
			useEslintrc: false,
			overrideConfig: {
				rules: {
					"no-markdown-links": "error",
				},
				parser: "@typescript-eslint/parser",
				parserOptions: {
					project: path.join(__dirname, "../example/tsconfig.json"),
				},
			},
			rulePaths: [path.join(__dirname, "../../rules")],
		});
		const fileToLint = path.join(__dirname, "../example/no-markdown-links", file);
		const results = await eslint.lintFiles([fileToLint]);
		return results[0];
	}

	it("Should report errors for Markdown links in block comments", async function () {
		const result = await lintFile("test.ts");
		assert.strictEqual(result.errorCount, 1, "Should have 1 error");
		assert.strictEqual(
			result.messages[0].message,
			"Markdown link syntax (`[text](url)`) is not allowed in JSDoc/TSDoc comments. Use `{@link url|text}` syntax instead.",
		);
		assert.strictEqual(result.messages[0].line, 12);
	});
});
