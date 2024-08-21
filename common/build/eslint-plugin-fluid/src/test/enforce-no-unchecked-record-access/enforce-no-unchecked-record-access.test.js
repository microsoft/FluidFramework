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
		const fileToLint = path.join(__dirname, "../example/no-unchecked-record-access", file);
		const results = await eslint.lintFiles([fileToLint]);
		return results[0];
	}

	it("Should report an error for unchecked record access", async function () {
		const result = await lintFile("fileWithOnlyRecordAccess.ts");
		assert.strictEqual(result.errorCount, 14, "Should have 14 errors");
		assert.strictEqual(
			result.messages[0].message,
			"'nullableIndexedRecord.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[0].line, 21);
		assert.strictEqual(
			result.messages[1].message,
			"'undefinableIndexedRecord.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[1].line, 25);
		assert.strictEqual(
			result.messages[2].message,
			"'nestedObj.nested.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[2].line, 30);
		assert.strictEqual(
			result.messages[3].message,
			"'indexedRecordOfStrings.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[3].line, 49);
		assert.strictEqual(
			result.messages[4].message,
			"'indexedRecordOfStrings[\"a\"]' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[4].line, 51);
		assert.strictEqual(
			result.messages[5].message,
			"'indexedRecordOfStrings[a]' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[5].line, 52);
		assert.strictEqual(
			result.messages[6].message,
			"'indexedRecordOfStrings[b]' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[6].line, 53);
		assert.strictEqual(
			result.messages[7].message,
			"Returning 'record.a' directly from an index signature type is not allowed. It may be 'undefined'",
		);
		assert.strictEqual(result.messages[7].line, 68);
		assert.strictEqual(
			result.messages[8].message,
			"Returning 'record.a' directly from an index signature type is not allowed. It may be 'undefined'",
		);
		assert.strictEqual(result.messages[8].line, 76);
		assert.strictEqual(
			result.messages[9].message,
			"Passing 'indexedRecordOfStrings.a' from an index signature type to a strictly typed parameter is not allowed. It may be 'undefined'",
		);
		assert.strictEqual(result.messages[9].line, 87);
		assert.strictEqual(
			result.messages[10].message,
			"'indexedRecordOfStrings.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[10].line, 101);
		assert.strictEqual(
			result.messages[11].message,
			"Implicit typing for 'indexedRecordOfStrings.a' from an index signature type is not allowed. Please provide an explicit type annotation or enable noUncheckedIndexedAccess",
		);
		assert.strictEqual(result.messages[11].line, 103);
		assert.strictEqual(
			result.messages[12].message,
			"'indexedRecordOfStrings.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[12].line, 108);
		assert.strictEqual(
			result.messages[13].message,
			"Assigning 'indexedRecordOfStrings.a' from an index signature type to a strictly typed variable is not allowed. It may be 'undefined'",
		);
		assert.strictEqual(result.messages[13].line, 111);
	});

	it("Should not report an error for valid array access", async function () {
		const result = await lintFile("fileWithOnlyArrayAccess.ts");
		assert.strictEqual(result.errorCount, 0, "Should have no errors");
	});
});
