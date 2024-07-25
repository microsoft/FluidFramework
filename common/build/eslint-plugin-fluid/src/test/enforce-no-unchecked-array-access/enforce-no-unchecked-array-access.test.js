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
		const fileToLint = path.join(__dirname, "../mockFiles/no-unchecked-array-access", file);
		const results = await eslint.lintFiles(fileToLint);
		return results[0]
	}

	it("Should report an error for unchecked record access but not array access", async function () {
		const result = await lintFile("fileWithArrayAndRecordAccess.ts");
		assert.strictEqual(result.errorCount, 2, "Should have two errors");
		assert.strictEqual(
			result.messages[0].message,
			"Unchecked access to a record index detected.",
		);
	});

	it("Should not report an error for valid array access", async function () {
		const result = await lintFile("fileWithOnlyArrayAccess.ts");
		assert.strictEqual(result.errorCount, 0, "Should have no errors");
	});
});
