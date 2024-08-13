/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("assert");
const path = require("path");
const { ESLint } = require("eslint");

describe("ESLint Rule Tests", function () {
	async function lintFile(file) {
		const eslint = new ESLint({
			useEslintrc: false,
			overrideConfig: {
				rules: {
					"no-unchecked-record-access": "error",
				},
				parser: "@typescript-eslint/parser",
				parserOptions: {
					project: path.join(__dirname, "../tsconfig.json"),
				},
			},
			rulePaths: [path.join(__dirname, "../../rules")],
		});
		const fileToLint = path.join(__dirname, "../mockFiles/no-unchecked-record-access", file);
		const results = await eslint.lintFiles([fileToLint]);
		return results[0];
	}

	it.only("Should report an error for unchecked record access", async function () {
		const result = await lintFile("fileWithOnlyRecordAccess.ts");
		console.log(result);
		assert.strictEqual(result.errorCount, 6, "Should have 6 errors");
		assert.strictEqual(
			result.messages[0].message,
			"'nestedObj.nested.a' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[1].message,
			"'indexedRecordOfStrings.a' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[2].message,
			"'indexedRecordOfStrings[\"a\"]' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[3].message,
			"'indexedRecordOfStrings[a]' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[4].message,
			"'indexedRecordOfStrings[b]' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[6].message,
			"Unchecked property access on index signature type. The variable expects a non-optional type.",
		);
		assert.strictEqual(result.messages[7].message, "'aImplicitType' is possibly 'undefined'");
	});

	it("Should not report an error for valid array access", async function () {
		const result = await lintFile("fileWithOnlyArrayAccess.ts");
		assert.strictEqual(result.errorCount, 0, "Should have no errors");
	});
});
