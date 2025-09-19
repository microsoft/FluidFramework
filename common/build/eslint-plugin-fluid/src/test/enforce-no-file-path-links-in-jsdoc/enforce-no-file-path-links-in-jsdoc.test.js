/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("assert");
const path = require("path");
const { ESLint } = require("eslint");

describe("Do not allow file path links in JSDoc/TSDoc comments", function () {
	async function lintFile(file) {
		const eslint = new ESLint({
			useEslintrc: false,
			overrideConfig: {
				rules: {
					"no-file-path-links-in-jsdoc": "error",
				},
				parser: "@typescript-eslint/parser",
				parserOptions: {
					project: path.join(__dirname, "../example/tsconfig.json"),
				},
			},
			rulePaths: [path.join(__dirname, "../../rules")],
		});
		const fileToLint = path.join(__dirname, "../example/no-file-path-links-in-jsdoc", file);
		const results = await eslint.lintFiles([fileToLint]);
		assert.equal(results.length, 1, "Expected a single result for linting a single file.");
		return results[0];
	}

	const expectedErrorMessage =
		"File path links are not allowed in JSDoc/TSDoc comments. Link to a stable, user-accessible resource (like an API reference or a GitHub URL) instead.";

	it("Should report errors for file path links in block comments", async function () {
		const result = await lintFile("test.ts");
		assert.strictEqual(result.errorCount, 4);

		// Error 1
		assert.strictEqual(result.messages[0].message, expectedErrorMessage);
		assert.strictEqual(result.messages[0].line, 10);

		// Error 2
		assert.strictEqual(result.messages[1].message, expectedErrorMessage);
		assert.strictEqual(result.messages[1].line, 11);

		// Error 3
		assert.strictEqual(result.messages[2].message, expectedErrorMessage);
		assert.strictEqual(result.messages[2].line, 16);

		// Error 4
		assert.strictEqual(result.messages[3].message, expectedErrorMessage);
		assert.strictEqual(result.messages[3].line, 17);
	});
});
