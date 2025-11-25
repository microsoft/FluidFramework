/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("assert");
const path = require("path");
const { createESLintConfig, eslintVersion, ESLint } = require("./eslintConfigHelper.cjs");

describe(`Do not allow \`-\` following JSDoc/TSDoc tags (eslint ${eslintVersion})`, function () {
	/**
	 *
	 * @param {string} file - Path to the file being linted. Relative to the `example/no-hyphen-after-jsdoc-tag` folder.
	 * @returns
	 */
	async function lintFile(file) {
		const eslintOptions = createESLintConfig({
			rules: {
				"@fluid-internal/fluid/no-hyphen-after-jsdoc-tag": "error",
			},
		});

		const eslint = new ESLint(eslintOptions);
		const fileToLint = path.join(__dirname, "./test-cases/no-hyphen-after-jsdoc-tag", file);
		const results = await eslint.lintFiles([fileToLint]);
		assert.equal(results.length, 1, "Expected a single result for linting a single file.");
		return results[0];
	}

	const expectedErrorMessage =
		"JSDoc/TSDoc block tags must not be followed by a hyphen character (`-`).";

	it("Should report errors JSDoc/TSDoc tags followed by a hyphen", async function () {
		const result = await lintFile("test.ts");
		assert.strictEqual(result.errorCount, 3);

		// Error 1
		const error1 = result.messages[0];
		assert.strictEqual(error1.message, expectedErrorMessage);
		assert.strictEqual(error1.line, 8);
		assert.strictEqual(error1.column, 4); // 1-based, inclusive
		assert.strictEqual(error1.endColumn, 13); // 1-based, exclusive

		// Error 2
		const error2 = result.messages[1];
		assert.strictEqual(error2.message, expectedErrorMessage);
		assert.strictEqual(error2.line, 9);
		assert.strictEqual(error2.column, 4); // 1-based, inclusive
		assert.strictEqual(error2.endColumn, 16); // 1-based, exclusive

		// Error 3
		const error3 = result.messages[2];
		assert.strictEqual(error3.message, expectedErrorMessage);
		assert.strictEqual(error3.line, 10);
		assert.strictEqual(error3.column, 4); // 1-based, inclusive
		assert.strictEqual(error3.endColumn, 13); // 1-based, exclusive
	});
});
