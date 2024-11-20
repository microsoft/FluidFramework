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
					project: path.join(__dirname, "../example/tsconfig.json"),
				},
			},
			rulePaths: [path.join(__dirname, "../../rules")],
		});
		const fileToLint = path.join(__dirname, "../example/no-unchecked-record-access", file);
		const results = await eslint.lintFiles([fileToLint]);
		return results[0];
	}

	it("Should report an error for unchecked record access for indexed record of strings in generics", async function () {
		const result = await lintFile("generics.ts");
		assert.strictEqual(result.errorCount, 1, "Should have 1 error");
		assert.strictEqual(
			result.messages[0].message,
			"Returning 'record.a' directly from an index signature type is not allowed. 'record.a' may be 'undefined'",
		);
		assert.strictEqual(result.messages[0].line, 11);
	});

	it("Should report errors for unchecked record access for indexed record of strings", async function () {
		const result = await lintFile("indexedRecordOfStrings.ts");
		const expectedLines = [25, 27, 28, 29, 46, 61, 80, 82, 85, 92, 97];

		assert.strictEqual(result.errorCount, 11, "Should have 11 errors");

		assert.strictEqual(
			result.messages[0].message,
			"'indexedRecordOfStrings.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[0].line, expectedLines[0]);

		assert.strictEqual(
			result.messages[1].message,
			"'indexedRecordOfStrings[\"a\"]' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[1].line, expectedLines[1]);

		assert.strictEqual(
			result.messages[2].message,
			"'indexedRecordOfStrings[a]' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[2].line, expectedLines[2]);

		assert.strictEqual(
			result.messages[3].message,
			"'indexedRecordOfStrings[b]' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[3].line, expectedLines[3]);

		assert.strictEqual(
			result.messages[4].message,
			"Returning 'record.a' directly from an index signature type is not allowed. 'record.a' may be 'undefined'",
		);
		assert.strictEqual(result.messages[4].line, expectedLines[4]);

		assert.strictEqual(
			result.messages[5].message,
			"Passing 'indexedRecordOfStrings.a' from an index signature type to a strictly typed parameter is not allowed. 'indexedRecordOfStrings.a' may be 'undefined'",
		);
		assert.strictEqual(result.messages[5].line, expectedLines[5]);

		assert.strictEqual(
			result.messages[6].message,
			"'indexedRecordOfStrings.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[6].line, expectedLines[6]);

		assert.strictEqual(
			result.messages[7].message,
			"'indexedRecordOfStrings.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[7].line, expectedLines[7]);

		assert.strictEqual(
			result.messages[8].message,
			"Assigning 'indexedRecordOfStrings.a' from an index signature type to a strictly typed variable without 'undefined' is not allowed. 'indexedRecordOfStrings.a' may be 'undefined'",
		);
		assert.strictEqual(result.messages[8].line, expectedLines[8]);

		assert.strictEqual(
			result.messages[9].message,
			"Implicit typing derived from 'indexedRecordOfStrings.a' is not allowed. 'indexedRecordOfStrings' is an index signature type and 'a' may be undefined. Please provide an explicit type annotation including undefined or enable noUncheckedIndexedAccess",
		);
		assert.strictEqual(result.messages[9].line, expectedLines[9]);
		assert.strictEqual(result.messages[10].line, expectedLines[10]);
	});

	it("Should report an error for unchecked nested record access", async function () {
		const result = await lintFile("nestedIndexSignatures.ts");
		assert.strictEqual(result.errorCount, 1, "Should have 1 error");
		assert.strictEqual(
			result.messages[0].message,
			"'nestedObj.nested.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[0].line, 18);
	});

	it("Should report errors for unchecked record access in nullableIndexedRecord", async function () {
		const result = await lintFile("nullableIndexedRecord.ts");
		const expectedLines = [21, 40, 47, 48, 53, 60, 80, 82, 85, 92, 97];

		assert.strictEqual(result.errorCount, 6, "Should have 6 errors");

		assert.strictEqual(
			result.messages[0].message,
			"Returning 'record.a' directly from an index signature type is not allowed. 'record.a' may be 'undefined'",
		);
		assert.strictEqual(result.messages[0].line, expectedLines[0]);

		assert.strictEqual(
			result.messages[1].message,
			"Passing 'nullableIndexedRecord.a' from an index signature type to a strictly typed parameter is not allowed. 'nullableIndexedRecord.a' may be 'undefined'",
		);
		assert.strictEqual(result.messages[1].line, expectedLines[1]);

		assert.strictEqual(
			result.messages[2].message,
			"'nullableIndexedRecord.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[2].line, expectedLines[2]);

		assert.strictEqual(
			result.messages[3].message,
			"'nullableIndexedRecord.a' is possibly 'undefined'",
		);
		assert.strictEqual(result.messages[3].line, expectedLines[3]);

		assert.strictEqual(
			result.messages[4].message,
			"Assigning 'nullableIndexedRecord.a' from an index signature type to a strictly typed variable without 'undefined' is not allowed. 'nullableIndexedRecord.a' may be 'undefined'",
		);
		assert.strictEqual(result.messages[4].line, expectedLines[4]);

		assert.strictEqual(
			result.messages[5].message,
			"Implicit typing derived from 'nullableIndexedRecord.a' is not allowed. 'nullableIndexedRecord' is an index signature type and 'a' may be undefined. Please provide an explicit type annotation including undefined or enable noUncheckedIndexedAccess",
		);
		assert.strictEqual(result.messages[5].line, expectedLines[5]);
	});

	it("Should not report errors for correct usage of undefinableIndexedRecord", async function () {
		const result = await lintFile("undefinableIndexedRecord.ts");
		assert.strictEqual(result.errorCount, 0, "Should have no errors");
	});

	it("Should not report errors for static types", async function () {
		const result = await lintFile("staticTypes.ts");
		assert.strictEqual(result.errorCount, 0, "Should have no errors");
	});

	it("Should not report an error for valid array access", async function () {
		const result = await lintFile("fileWithOnlyArrayAccess.ts");
		assert.strictEqual(result.errorCount, 0, "Should have no errors");
	});
});
