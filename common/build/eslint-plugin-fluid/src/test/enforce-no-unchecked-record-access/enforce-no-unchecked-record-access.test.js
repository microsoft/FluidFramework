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

	it("Should report an error for unchecked record access", async function () {
		const result = await lintFile("fileWithOnlyRecordAccess.ts");
		assert.strictEqual(result.errorCount, 8, "Should have eight errors");
		assert.strictEqual(
			result.messages[0].message,
			"'nestedObj.nested.a' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[1].message,
			"'someObjWithStaticType[c]' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[2].message,
			"'someObjWithPotenciallyUndefinedProperties.a' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[3].message,
			"'someObjWithPotenciallyUndefinedProperties[a]' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[4].message,
			"'someObjWithPotenciallyUndefinedProperties[a]' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[5].message,
			"'someObjWithPotenciallyUndefinedProperties[b]' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[6].message,
			"'someObjWithPotenciallyUndefinedProperties[c]' is possibly 'undefined'",
		);
		assert.strictEqual(
			result.messages[7].message,
			"'nonNullObj.maybeString' is possibly 'undefined'",
		);
	});

	it("Should not report an error for valid array access", async function () {
		const result = await lintFile("fileWithOnlyArrayAccess.ts");
		assert.strictEqual(result.errorCount, 0, "Should have no errors");
	});
});
