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

module.exports = { recommended, strict, minimalDeprecated };
