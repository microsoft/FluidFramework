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

// Global override: disable type-aware project for JS-only files lacking tsconfig.
// JavaScript files don't have TypeScript type information, so TypeScript-specific parsing must be disabled.
const jsNoProject = {
	files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
	languageOptions: { parserOptions: { project: null } },
};
recommended.push(jsNoProject);
strict.push(jsNoProject);
minimalDeprecated.push(jsNoProject);

// Disable type-required @typescript-eslint rules for pure JS files (no tsconfig type info).
// These rules require TypeScript's type-checker, which isn't available for JavaScript files.
const jsTypeAwareDisable = {
	files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
	rules: {
		"@typescript-eslint/await-thenable": "off",
		"@typescript-eslint/no-floating-promises": "off",
		"@typescript-eslint/no-misused-promises": "off",
		"@typescript-eslint/require-await": "off",
		"@typescript-eslint/restrict-plus-operands": "off",
		"@typescript-eslint/restrict-template-expressions": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
		"@typescript-eslint/no-unsafe-return": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"@typescript-eslint/no-array-delete": "off",
		"@typescript-eslint/no-base-to-string": "off",
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
		"@typescript-eslint/no-floating-promises": "off",
		"@typescript-eslint/no-misused-promises": "off",
		"@typescript-eslint/require-await": "off",
		"@typescript-eslint/restrict-plus-operands": "off",
		"@typescript-eslint/restrict-template-expressions": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
		"@typescript-eslint/no-unsafe-return": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
	},
};
recommended.push(tsTestTypeAwareDisable);
strict.push(tsTestTypeAwareDisable);
minimalDeprecated.push(tsTestTypeAwareDisable);

export { recommended, strict, minimalDeprecated };
