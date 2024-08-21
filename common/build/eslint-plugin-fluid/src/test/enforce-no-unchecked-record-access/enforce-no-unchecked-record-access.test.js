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
		assert.strictEqual(result.messages[0].line, 36);

		assert.strictEqual(
			result.messages[1].message,
			"'undefinableIndexedRecord.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[1].line, 41);

		assert.strictEqual(
			result.messages[2].message,
			"'indexedRecordOfStrings.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[2].line, 46);

		assert.strictEqual(
			result.messages[3].message,
			`'indexedRecordOfStrings["a"]' is possibly 'undefined'`,
		);
		assert.strictEqual(result.messages[3].line, 48);

		assert.strictEqual(
			result.messages[4].message,
			"'indexedRecordOfStrings[a]' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[4].line, 49);

		assert.strictEqual(
			result.messages[5].message,
			"'indexedRecordOfStrings[b]' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[5].line, 50);

		assert.strictEqual(
			result.messages[6].message,
			"Returning 'record.a' directly from an index signature type is not allowed. It may be 'undefined'",
		);
		assert.strictEqual(result.messages[6].line, 67);

		assert.strictEqual(
			result.messages[7].message,
			"Returning 'record.a' directly from an index signature type is not allowed. It may be 'undefined'",
		);
		assert.strictEqual(result.messages[7].line, 75);

		assert.strictEqual(
			result.messages[8].message,
			"Passing 'indexedRecordOfStrings.a' from an index signature type to a strictly typed parameter is not allowed. It may be 'undefined'",
		);
		assert.strictEqual(result.messages[8].line, 91);

		assert.strictEqual(
			result.messages[9].message,
			"'indexedRecordOfStrings.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[9].line, 110);

		assert.strictEqual(
			result.messages[10].message,
			"Implicit typing for 'indexedRecordOfStrings.a' from an index signature type is not allowed. Please provide an explicit type annotation or enable noUncheckedIndexedAccess",
		);
		assert.strictEqual(result.messages[10].line, 112);

		assert.strictEqual(
			result.messages[11].message,
			"'indexedRecordOfStrings.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[11].line, 117);

		assert.strictEqual(
			result.messages[12].message,
			"Assigning 'indexedRecordOfStrings.a' from an index signature type to a strictly typed variable is not allowed. It may be 'undefined'",
		);
		assert.strictEqual(result.messages[12].line, 120);

		assert.strictEqual(
			result.messages[13].message,
			"'nestedObj.nested.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[13].line, 151);
	});

	it("Should not report an error for valid array access", async function () {
		const result = await lintFile("fileWithOnlyArrayAccess.ts");
		assert.strictEqual(result.errorCount, 0, "Should have no errors");
	});
});
