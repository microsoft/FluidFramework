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
		const error1 = result.messages[0];
		assert.strictEqual(error1.message, expectedErrorMessage);
		assert.strictEqual(error1.line, 10);
		assert.strictEqual(error1.column, 56); // 1-based, inclusive
		assert.strictEqual(error1.endColumn, 84); // 1-based, exclusive

		// Error 2
		const error2 = result.messages[1];
		assert.strictEqual(error2.message, expectedErrorMessage);
		assert.strictEqual(error2.line, 11);
		assert.strictEqual(error2.column, 17); // 1-based, inclusive
		assert.strictEqual(error2.endColumn, 41); // 1-based, exclusive

		// Error 3
		const error3 = result.messages[2];
		assert.strictEqual(error3.message, expectedErrorMessage);
		assert.strictEqual(error3.line, 16);
		assert.strictEqual(error3.column, 57); // 1-based, inclusive
		assert.strictEqual(error3.endColumn, 84); // 1-based, exclusive

		// Error 4
		const error4 = result.messages[3];
		assert.strictEqual(error4.message, expectedErrorMessage);
		assert.strictEqual(error4.line, 17);
		assert.strictEqual(error4.column, 17); // 1-based, inclusive
		assert.strictEqual(error4.endColumn, 40); // 1-based, exclusive
	});
});
