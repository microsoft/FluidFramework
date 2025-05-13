const assert = require("assert");
const path = require("path");
const { ESLint } = require("eslint");

describe("no-before-each rule", function () {
	async function lintFile(file) {
		const eslint = new ESLint({
			useEslintrc: false,
			overrideConfig: {
				rules: {
					"no-before-each": "error",
				},
				parser: "@typescript-eslint/parser",
				parserOptions: {
					project: path.join(__dirname, "../example/tsconfig.json"),
				},
			},
			rulePaths: [path.join(__dirname, "../../rules")],
		});
		const fileToLint = path.join(__dirname, file);
		const results = await eslint.lintFiles([fileToLint]);
		return results[0];
	}

	it("Should report an error for using beforeEach", async function () {
		const result = await lintFile("fixtures/with-before-each.js");
		assert.strictEqual(result.errorCount, 1, "Should have 1 error");
		assert.strictEqual(
			result.messages[0].message,
			"Calls to 'beforeEach' are not allowed.",
		);
	});

	it("Should not report an error when beforeEach is not used", async function () {
		const result = await lintFile("fixtures/without-before-each.js");
		assert.strictEqual(result.errorCount, 0, "Should have no errors");
	});
});
