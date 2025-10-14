/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("assert");
const path = require("path");
const { createESLintConfig, eslintVersion, ESLint } = require("../eslintConfigHelper.cjs");

describe(`ESLint Rule Tests (eslint ${eslintVersion})`, function () {
	function createESLintInstance(config) {
		const eslintOptions = createESLintConfig({
			parserOptions: config.parserOptions,
			rules: config.rules,
			extraPlugins: config.plugins,
		});

		return new ESLint(eslintOptions);
	}

	it("Should report an error for restricted tag imports", async function () {
		const eslint = createESLintInstance({
			rules: {
				"@fluid-internal/fluid/no-restricted-tags-imports": [
					"error",
					{
						tags: ["@internal", "@alpha"],
						exceptions: { "@alpha": ["./exceptionFile.ts"] },
					},
				],
			},
			parserOptions: {
				project: path.join(__dirname, "../example/tsconfig.json"),
			},
		});
		const filesToLint = ["fileWithImports.ts", "mockModule.ts"].map((file) =>
			path.join(__dirname, "../example/no-restricted-tags-imports", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];
		assert.strictEqual(result.errorCount, 2, "Should have two errors");
		assert.strictEqual(
			result.messages[0].message,
			"Importing @internal tagged items is not allowed: internalFunction",
		);
		assert.strictEqual(
			result.messages[1].message,
			"Importing @alpha tagged items is not allowed: alphaFunction",
		);
	});

	it("Should not report an error for restricted tag imports for exceptions", async function () {
		const eslint = createESLintInstance({
			rules: {
				"@fluid-internal/fluid/no-restricted-tags-imports": [
					"error",
					{
						tags: ["@internal", "@alpha"],
						exceptions: {
							"@alpha": ["./exceptionFile.ts"],
							"@internal": ["./exceptionFile.ts"],
						},
					},
				],
			},
			parserOptions: {
				project: path.join(__dirname, "../example/tsconfig.json"),
			},
		});
		const filesToLint = ["fileWithExceptionImports.ts", "exceptionFile.ts"].map((file) =>
			path.join(__dirname, "../example/no-restricted-tags-imports", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];

		assert.strictEqual(result.errorCount, 0, "Should have no errors");
	});

	it("Should report an error for tsconfig provided config", async function () {
		const eslint = createESLintInstance({
			rules: {
				"@fluid-internal/fluid/no-restricted-tags-imports": [
					"error",
					{
						tags: ["@internal", "@alpha"],
						exceptions: {
							"@alpha": ["./exceptionFile.ts"],
							"@internal": ["./exceptionFile.ts"],
						},
					},
				],
			},
			parserOptions: {
				project: path.join(__dirname, "../example/tsconfig.json"),
			},
		});
		const filesToLint = ["fileWithImports.ts", "mockModule.ts"].map((file) =>
			path.join(__dirname, "../example/no-restricted-tags-imports", file),
		);
		const results = await eslint.lintFiles(filesToLint);
		const result = results[0];

		assert.strictEqual(result.errorCount, 2, "Should have two errors");
		assert.strictEqual(
			result.messages[0].message,
			"Importing @internal tagged items is not allowed: internalFunction",
		);
	});
});
