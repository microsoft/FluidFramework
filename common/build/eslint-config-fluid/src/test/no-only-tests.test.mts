/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/// <reference types="mocha" />

/**
 * Tests verifying that `no-only-tests/no-only-tests` is correctly wired into the
 * recommended and strict flat configs:
 *
 * - `.only()` calls in test files produce errors.
 * - Normal test calls in test files produce no errors.
 * - `.only()` calls in non-test files produce no errors (rule is test-scoped).
 */

import { strict as assert } from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { recommended, strict } from "../../flat.mjs";
import { createESLintForConfig } from "./eslintConfigHelper.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RULE_ID = "no-only-tests/no-only-tests";

const configs = [
	{ name: "recommended", config: recommended },
	{ name: "strict", config: strict },
] as const;

for (const { name: configName, config } of configs) {
	describe(`${RULE_ID} (${configName} config)`, function () {
		// TypeScript's project service can be slow on first use.
		this.timeout(60_000);

		/**
		 * Resolves a filename relative to the no-only-tests test-cases directory.
		 */
		function fixture(filename: string): string {
			return path.join(__dirname, "test-cases", "no-only-tests", filename);
		}

		it("reports errors for .only() calls in test files", async function () {
			const eslint = createESLintForConfig(config);
			const [result] = await eslint.lintFiles([fixture("only.spec.ts")]);
			assert.ok(result !== undefined, "Expected a lint result");

			const violations = result.messages.filter((m) => m.ruleId === RULE_ID);
			assert.strictEqual(
				violations.length,
				3,
				`Expected 3 violations; got: ${violations.map((v) => `line ${v.line}`).join(", ")}`,
			);
		});

		it("does not report errors for normal test calls in test files", async function () {
			const eslint = createESLintForConfig(config);
			const [result] = await eslint.lintFiles([fixture("valid.spec.ts")]);
			assert.ok(result !== undefined, "Expected a lint result");

			const violations = result.messages.filter((m) => m.ruleId === RULE_ID);
			assert.strictEqual(
				violations.length,
				0,
				`Expected 0 violations; got: ${violations.map((v) => `line ${v.line}: ${v.message}`).join(", ")}`,
			);
		});

		it("does not apply to non-test files", async function () {
			const eslint = createESLintForConfig(config);
			// Use lintText with a synthetic path outside src/test/ so no test-file
			// pattern matches — the rule should not be active for this file.
			const [result] = await eslint.lintText(
				`describe.only("should not be caught", () => {});\n`,
				{ filePath: path.join(process.cwd(), "src", "utils.ts") },
			);
			assert.ok(result !== undefined, "Expected a lint result");

			const violations = result.messages.filter((m) => m.ruleId === RULE_ID);
			assert.strictEqual(
				violations.length,
				0,
				`Expected no violations in non-test files; got: ${violations.map((v) => `line ${v.line}: ${v.message}`).join(", ")}`,
			);
		});
	});
}
