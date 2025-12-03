/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// ESLint 9 flat-config compatibility wrapper for existing eslintrc configs.
// Consumers can import { recommended, strict, minimalDeprecated } from this module
// and spread them into their eslint.config.js.

import { FlatCompat } from "@eslint/eslintrc";
import eslintJs from "@eslint/js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: eslintJs.configs.recommended,
	allConfig: eslintJs.configs.all,
});

/** @type {import("eslint").Linter.FlatConfig[]} */
const recommended = compat.config({ extends: [path.join(__dirname, "recommended.js")] });
/** @type {import("eslint").Linter.FlatConfig[]} */
const strict = compat.config({ extends: [path.join(__dirname, "strict.js")] });
/** @type {import("eslint").Linter.FlatConfig[]} */
const minimalDeprecated = compat.config({
	extends: [path.join(__dirname, "minimal-deprecated.js")],
});

// Disable type-aware parsing (parserOptions.project) for test files to avoid project lookup errors.
// Many test files are not included in tsconfig.json project references, which causes ESLint to fail
// when trying to generate type information.
const testDisableProject = {
	files: ["**/src/test/**", "**/tests/**", "**/*.spec.ts", "**/*.test.ts"],
	languageOptions: { parserOptions: { project: null } },
};
recommended.push({ ...testDisableProject });
strict.push({ ...testDisableProject });
minimalDeprecated.push({ ...testDisableProject });

// Global override: disable type-aware project for JS-only files and .d.ts files lacking tsconfig.
// JavaScript files don't have TypeScript type information, so TypeScript-specific parsing must be disabled.
// .d.ts files are often not included in tsconfig.json project references.
// .cts and .mts files often aren't included in tsconfig.json either (they use separate tsconfig.cjs.json).
const jsNoProject = {
	files: ["**/*.js", "**/*.cjs", "**/*.mjs", "**/*.d.ts", "**/*.cts", "**/*.mts"],
	languageOptions: { parserOptions: { project: null } },
};
recommended.push(jsNoProject);
strict.push(jsNoProject);
minimalDeprecated.push(jsNoProject);

// Disable type-required @typescript-eslint rules for pure JS files and .d.ts files (no tsconfig type info).
// These rules require TypeScript's type-checker, which isn't available for JavaScript files.
// .d.ts files are declaration files and shouldn't be linted with type-aware rules.
// .cts and .mts files often use separate tsconfig.cjs.json without full type checking enabled.
const jsTypeAwareDisable = {
	files: ["**/*.js", "**/*.cjs", "**/*.mjs", "**/*.d.ts", "**/*.cts", "**/*.mts"],
	rules: {
		"@typescript-eslint/await-thenable": "off",
		"@typescript-eslint/consistent-return": "off",
		"@typescript-eslint/consistent-type-exports": "off",
		"@typescript-eslint/dot-notation": "off",
		"@typescript-eslint/naming-convention": "off",
		"@typescript-eslint/no-array-delete": "off",
		"@typescript-eslint/no-base-to-string": "off",
		"@typescript-eslint/no-confusing-void-expression": "off",
		"@typescript-eslint/no-deprecated": "off",
		"@typescript-eslint/no-duplicate-type-constituents": "off",
		"@typescript-eslint/no-floating-promises": "off",
		"@typescript-eslint/no-for-in-array": "off",
		"@typescript-eslint/no-implied-eval": "off",
		"@typescript-eslint/no-meaningless-void-operator": "off",
		"@typescript-eslint/no-misused-promises": "off",
		"@typescript-eslint/no-mixed-enums": "off",
		"@typescript-eslint/no-redundant-type-constituents": "off",
		"@typescript-eslint/no-unnecessary-boolean-literal-compare": "off",
		"@typescript-eslint/no-unnecessary-condition": "off",
		"@typescript-eslint/no-unnecessary-qualifier": "off",
		"@typescript-eslint/no-unnecessary-template-expression": "off",
		"@typescript-eslint/no-unnecessary-type-arguments": "off",
		"@typescript-eslint/no-unnecessary-type-assertion": "off",
		"@typescript-eslint/no-unnecessary-type-parameters": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-enum-comparison": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
		"@typescript-eslint/no-unsafe-return": "off",
		"@typescript-eslint/no-unsafe-type-assertion": "off",
		"@typescript-eslint/no-unsafe-unary-minus": "off",
		"@typescript-eslint/non-nullable-type-assertion-style": "off",
		"@typescript-eslint/only-throw-error": "off",
		"@typescript-eslint/prefer-destructuring": "off",
		"@typescript-eslint/prefer-find": "off",
		"@typescript-eslint/prefer-includes": "off",
		"@typescript-eslint/prefer-nullish-coalescing": "off",
		"@typescript-eslint/prefer-optional-chain": "off",
		"@typescript-eslint/prefer-promise-reject-errors": "off",
		"@typescript-eslint/prefer-readonly": "off",
		"@typescript-eslint/prefer-readonly-parameter-types": "off",
		"@typescript-eslint/prefer-reduce-type-parameter": "off",
		"@typescript-eslint/prefer-regexp-exec": "off",
		"@typescript-eslint/prefer-return-this-type": "off",
		"@typescript-eslint/prefer-string-starts-ends-with": "off",
		"@typescript-eslint/promise-function-async": "off",
		"@typescript-eslint/related-getter-setter-pairs": "off",
		"@typescript-eslint/require-array-sort-compare": "off",
		"@typescript-eslint/require-await": "off",
		"@typescript-eslint/restrict-plus-operands": "off",
		"@typescript-eslint/restrict-template-expressions": "off",
		"@typescript-eslint/return-await": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"@typescript-eslint/switch-exhaustiveness-check": "off",
		"@typescript-eslint/unbound-method": "off",
		"@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
	},
};
recommended.push(jsTypeAwareDisable);
strict.push(jsTypeAwareDisable);
minimalDeprecated.push(jsTypeAwareDisable);

// Disable type-required TS rules for TypeScript test files lacking project coverage.
// Even TypeScript test files often aren't included in tsconfig project references,
// so we disable type-aware rules for them as well to prevent linting errors.
const tsTestTypeAwareDisable = {
	files: ["**/src/test/**/*.{ts,tsx}", "**/tests/**/*.{ts,tsx}", "**/*.spec.ts", "**/*.test.ts"],
	rules: {
		"@typescript-eslint/await-thenable": "off",
		"@typescript-eslint/consistent-return": "off",
		"@typescript-eslint/consistent-type-exports": "off",
		"@typescript-eslint/dot-notation": "off",
		"@typescript-eslint/naming-convention": "off",
		"@typescript-eslint/no-array-delete": "off",
		"@typescript-eslint/no-base-to-string": "off",
		"@typescript-eslint/no-confusing-void-expression": "off",
		"@typescript-eslint/no-deprecated": "off",
		"@typescript-eslint/no-duplicate-type-constituents": "off",
		"@typescript-eslint/no-floating-promises": "off",
		"@typescript-eslint/no-for-in-array": "off",
		"@typescript-eslint/no-implied-eval": "off",
		"@typescript-eslint/no-meaningless-void-operator": "off",
		"@typescript-eslint/no-misused-promises": "off",
		"@typescript-eslint/no-mixed-enums": "off",
		"@typescript-eslint/no-redundant-type-constituents": "off",
		"@typescript-eslint/no-unnecessary-boolean-literal-compare": "off",
		"@typescript-eslint/no-unnecessary-condition": "off",
		"@typescript-eslint/no-unnecessary-qualifier": "off",
		"@typescript-eslint/no-unnecessary-template-expression": "off",
		"@typescript-eslint/no-unnecessary-type-arguments": "off",
		"@typescript-eslint/no-unnecessary-type-assertion": "off",
		"@typescript-eslint/no-unnecessary-type-parameters": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-enum-comparison": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
		"@typescript-eslint/no-unsafe-return": "off",
		"@typescript-eslint/no-unsafe-type-assertion": "off",
		"@typescript-eslint/no-unsafe-unary-minus": "off",
		"@typescript-eslint/non-nullable-type-assertion-style": "off",
		"@typescript-eslint/only-throw-error": "off",
		"@typescript-eslint/prefer-destructuring": "off",
		"@typescript-eslint/prefer-find": "off",
		"@typescript-eslint/prefer-includes": "off",
		"@typescript-eslint/prefer-nullish-coalescing": "off",
		"@typescript-eslint/prefer-optional-chain": "off",
		"@typescript-eslint/prefer-promise-reject-errors": "off",
		"@typescript-eslint/prefer-readonly": "off",
		"@typescript-eslint/prefer-readonly-parameter-types": "off",
		"@typescript-eslint/prefer-reduce-type-parameter": "off",
		"@typescript-eslint/prefer-regexp-exec": "off",
		"@typescript-eslint/prefer-return-this-type": "off",
		"@typescript-eslint/prefer-string-starts-ends-with": "off",
		"@typescript-eslint/promise-function-async": "off",
		"@typescript-eslint/related-getter-setter-pairs": "off",
		"@typescript-eslint/require-array-sort-compare": "off",
		"@typescript-eslint/require-await": "off",
		"@typescript-eslint/restrict-plus-operands": "off",
		"@typescript-eslint/restrict-template-expressions": "off",
		"@typescript-eslint/return-await": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"@typescript-eslint/switch-exhaustiveness-check": "off",
		"@typescript-eslint/unbound-method": "off",
		"@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
	},
};
recommended.push(tsTestTypeAwareDisable);
strict.push(tsTestTypeAwareDisable);
minimalDeprecated.push(tsTestTypeAwareDisable);

export { recommended, strict, minimalDeprecated };
