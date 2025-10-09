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
					"no-markdown-links-in-jsdoc": "error",
				},
				parser: "@typescript-eslint/parser",
				parserOptions: {
					project: path.join(__dirname, "../example/tsconfig.json"),
				},
			},
			rulePaths: [path.join(__dirname, "../../rules")],
		});
		const fileToLint = path.join(__dirname, "../example/no-markdown-links-in-jsdoc", file);
		const results = await eslint.lintFiles([fileToLint]);
		assert.equal(results.length, 1, "Expected a single result for linting a single file.");
		return results[0];
	}

	it("Should report errors for Markdown links in block comments", async function () {
		const result = await lintFile("test.ts");
		assert.strictEqual(result.errorCount, 1);

		const error = result.messages[0];
		assert.strictEqual(
			error.message,
			"Markdown link syntax (`[text](url)`) is not allowed in JSDoc/TSDoc comments. Use `{@link url|text}` syntax instead.",
		);
		assert.strictEqual(error.line, 10);
		assert.strictEqual(error.column, 51); // 1-based, inclusive
		assert.strictEqual(error.endColumn, 75); // 1-based, exclusive

		// Test auto-fix
		assert.notEqual(error.fix, undefined);
		assert.deepEqual(error.fix.range, [259, 283]); // 0-based global character index in the file. The start is inclusive, and the end is exclusive.
		assert.deepEqual(error.fix.text, "{@link https://bing.com | bing}");
	});
});
