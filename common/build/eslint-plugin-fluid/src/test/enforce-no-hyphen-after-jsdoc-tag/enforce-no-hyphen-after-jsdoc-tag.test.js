/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("assert");
const path = require("path");
const { ESLint } = require("eslint");

describe("Do not allow `-` following JSDoc/TSDoc tags", function () {
	/**
	 *
	 * @param {string} file - Path to the file being linted. Relative to the `example/no-hyphen-after-jsdoc-tag` folder.
	 * @returns
	 */
	async function lintFile(file) {
		const eslint = new ESLint({
			useEslintrc: false,
			overrideConfig: {
				rules: {
					"no-hyphen-after-jsdoc-tag": "error",
				},
				parser: "@typescript-eslint/parser",
				parserOptions: {
					project: path.join(__dirname, "../example/tsconfig.json"),
				},
			},
			rulePaths: [path.join(__dirname, "../../rules")],
		});
		const fileToLint = path.join(__dirname, "../example/no-hyphen-after-jsdoc-tag", file);
		const results = await eslint.lintFiles([fileToLint]);
		assert.equal(results.length, 1, "Expected a single result for linting a single file.");
		return results[0];
	}

	const expectedErrorMessage =
		"JSDoc/TSDoc block tags should not be followed by a hyphen character ('-').";

	it("Should report errors JSDoc/TSDoc tags followed by a hyphen", async function () {
		const result = await lintFile("test.ts");
		assert.strictEqual(result.errorCount, 3);

		// Error 1
		assert.strictEqual(result.messages[0].message, expectedErrorMessage);
		assert.strictEqual(result.messages[0].line, 8);
		assert.strictEqual(result.messages[0].fix?.text, "@remarks Here are some remarks.");

		// Error 2
		assert.strictEqual(result.messages[1].message, expectedErrorMessage);
		assert.strictEqual(result.messages[1].line, 9);
		assert.strictEqual(
			result.messages[1].fix?.text,
			"@deprecated This function is deprecated, use something else.",
		);

		// Error 3
		assert.strictEqual(result.messages[2].message, expectedErrorMessage);
		assert.strictEqual(result.messages[2].line, 10);
		assert.strictEqual(result.messages[2].fix?.text, "@returns The concatenated string.");
	});
});
