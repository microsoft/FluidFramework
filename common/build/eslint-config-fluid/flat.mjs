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

/**
 * @typedef {import("eslint").Linter.FlatConfig[]} FlatConfigArray
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: eslintJs.configs.recommended,
	allConfig: eslintJs.configs.all,
});

/** @type {FlatConfigArray} */
const recommended = compat.config({ extends: [path.join(__dirname, "recommended.js")] });
/** @type {FlatConfigArray} */
const strict = compat.config({ extends: [path.join(__dirname, "strict.js")] });
/** @type {FlatConfigArray} */
const minimalDeprecated = compat.config({
	extends: [path.join(__dirname, "minimal-deprecated.js")],
});

// Use projectService for automatic tsconfig discovery instead of manual project configuration.
// This eliminates the need to manually configure project paths and handles test files automatically.
// See: https://typescript-eslint.io/packages/parser#projectservice
const useProjectService = {
	files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
	languageOptions: {
		parserOptions: {
			projectService: true,
			tsconfigRootDir: import.meta.dirname,
		},
	},
};
recommended.push(useProjectService);
strict.push(useProjectService);
minimalDeprecated.push(useProjectService);

// Disable type-aware parsing for JS files and .d.ts files.
// JavaScript files don't have TypeScript type information.
// .d.ts files are declaration-only and don't need type-aware linting.
const jsNoProject = {
	files: ["**/*.js", "**/*.cjs", "**/*.mjs", "**/*.d.ts"],
	languageOptions: { parserOptions: { project: null, projectService: false } },
};
recommended.push(jsNoProject);
strict.push(jsNoProject);
minimalDeprecated.push(jsNoProject);

// Disable type-required @typescript-eslint rules for pure JS files and .d.ts files.
// These rules require TypeScript's type-checker, which isn't available for JavaScript files.
const jsTypeAwareDisable = {
	files: ["**/*.js", "**/*.cjs", "**/*.mjs", "**/*.d.ts"],
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

export { recommended, strict, minimalDeprecated };
