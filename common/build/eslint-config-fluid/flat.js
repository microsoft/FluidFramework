/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// ESLint 9 flat-config compatibility wrapper for existing eslintrc configs.
// Consumers can import { recommended, strict, minimalDeprecated } from this module
// and spread them into their eslint.config.js.

const { FlatCompat } = require("@eslint/eslintrc");
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: require("eslint/conf/eslint-recommended"),
	allConfig: require("eslint/conf/eslint-all"),
});

/** @type {import("eslint").Linter.FlatConfig[]} */
const recommended = compat.config({ extends: [require.resolve("./recommended.js")] });
/** @type {import("eslint").Linter.FlatConfig[]} */
const strict = compat.config({ extends: [require.resolve("./strict.js")] });
/** @type {import("eslint").Linter.FlatConfig[]} */
const minimalDeprecated = compat.config({ extends: [require.resolve("./minimal-deprecated.js")] });

module.exports = { recommended, strict, minimalDeprecated };