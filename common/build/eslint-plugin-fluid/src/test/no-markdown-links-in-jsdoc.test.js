/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("assert");
const path = require("path");
const { createESLintConfig, eslintVersion, ESLint } = require("./eslintConfigHelper.cjs");

describe(`Do not allow Markdown links in JSDoc/TSDoc comments (eslint ${eslintVersion})`, function () {
	async function lintFile(file) {
		const eslintOptions = createESLintConfig({
			rules: {
				"@fluid-internal/fluid/no-markdown-links-in-jsdoc": "error",
			},
		});

		const eslint = new ESLint(eslintOptions);
		const fileToLint = path.join(__dirname, "./test-cases/no-markdown-links-in-jsdoc", file);
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
