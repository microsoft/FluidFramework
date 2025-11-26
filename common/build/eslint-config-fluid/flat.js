/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// ESLint 9 flat-config compatibility wrapper for existing eslintrc configs.
// Consumers can import { recommended, strict, minimalDeprecated } from this module
// and spread them into their eslint.config.js.

const { FlatCompat } = require("@eslint/eslintrc");
const { configs } = require("@eslint/js");
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: configs.recommended,
	allConfig: configs.all,
});

/** @type {import("eslint").Linter.FlatConfig[]} */
const recommended = compat.config({ extends: [require.resolve("./recommended.js")] });
/** @type {import("eslint").Linter.FlatConfig[]} */
const strict = compat.config({ extends: [require.resolve("./strict.js")] });
/** @type {import("eslint").Linter.FlatConfig[]} */
const minimalDeprecated = compat.config({ extends: [require.resolve("./minimal-deprecated.js")] });

// Disable type-aware parsing (parserOptions.project) for test files to avoid project lookup errors.
const testDisableProject = {
	files: ["**/src/test/**", "**/tests/**", "**/*.spec.ts", "**/*.test.ts"],
	languageOptions: { parserOptions: { project: null } },
};
recommended.push({ ...testDisableProject });
strict.push({ ...testDisableProject });
minimalDeprecated.push({ ...testDisableProject });

// Global override: disable type-aware project for JS-only files lacking tsconfig.
const jsNoProject = {
	files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
	languageOptions: { parserOptions: { project: null } },
};
recommended.push(jsNoProject);
strict.push(jsNoProject);
minimalDeprecated.push(jsNoProject);

// Disable type-required @typescript-eslint rules for pure JS files (no tsconfig type info).
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

module.exports = { recommended, strict, minimalDeprecated };
