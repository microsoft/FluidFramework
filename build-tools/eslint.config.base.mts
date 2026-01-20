/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared ESLint configuration for build-tools packages.
 *
 * This module re-exports the minimalDeprecated config from @fluidframework/eslint-config-fluid
 * and provides additional utilities for build-tools specific needs.
 */

import { minimalDeprecated } from "@fluidframework/eslint-config-fluid/flat.mts";
import chaiFriendly from "eslint-plugin-chai-friendly";

/**
 * Build-tools specific rule overrides.
 * These packages are internal tooling, not public Fluid Framework packages,
 * so some rules from the shared config don't apply or are too strict.
 */
const buildToolsOverrides = {
	rules: {
		// Build-tools packages are internal tooling, not public packages.
		// The no-internal-modules rule is designed for the Fluid Framework package structure.
		"import-x/no-internal-modules": "off",

		// Build-tools uses @deprecated internally for deprecation warnings.
		// Keep as warning to track usage, but don't fail the build.
		"import-x/no-deprecated": "warn",

		// Build-tools are Node.js CLI tools that legitimately use Node built-in modules.
		"import-x/no-nodejs-modules": "off",

		// Import ordering is handled by Biome.
		"import-x/order": "off",

		// oclif commands require default exports.
		"import-x/no-default-export": "off",

		// Build-tools uses globby, execa, and other packages that have newer alternatives.
		// TODO: Consider migrating to alternatives over time.
		"depend/ban-dependencies": "off",

		// This rule is too strict for build-tools internal code.
		// TODO: Consider enabling and fixing violations.
		"@typescript-eslint/strict-boolean-expressions": "off",

		// This rule requires explicit handling of undefined for index signatures.
		// TODO: Consider enabling and fixing violations.
		"@fluid-internal/fluid/no-unchecked-record-access": "off",

		// Build-tools has some files that don't follow strict naming conventions.
		"unicorn/filename-case": "off",

		// Prefer-regexp-exec is a style preference, not a correctness issue.
		"@typescript-eslint/prefer-regexp-exec": "off",

		// These rules are useful but require code changes to fix.
		// TODO: Enable and fix violations.
		"@typescript-eslint/prefer-readonly": "off",
		"@typescript-eslint/promise-function-async": "off",
		"@typescript-eslint/no-shadow": "off",

		// JSDoc hyphen rules are stylistic.
		"jsdoc/require-hyphen-before-param-description": "off",
		"jsdoc/require-param-description": "off",

		// Prefer template literals is stylistic.
		"prefer-template": "off",

		// Allow non-null assertions in build-tools (internal code).
		"@typescript-eslint/no-non-null-assertion": "off",
		"@typescript-eslint/no-unnecessary-type-assertion": "off",

		// These rules require code changes. Disable for now.
		"@typescript-eslint/prefer-nullish-coalescing": "off",
		"@typescript-eslint/prefer-optional-chain": "off",
		"@typescript-eslint/no-unsafe-return": "off",
		"@typescript-eslint/no-floating-promises": "off",
		"@typescript-eslint/unbound-method": "off",
		"@typescript-eslint/consistent-type-definitions": "off",
		"@typescript-eslint/prefer-promise-reject-errors": "off",
		"@typescript-eslint/no-base-to-string": "off",
		"@typescript-eslint/no-unsafe-unary-minus": "off",

		// TSDoc hyphen rule.
		"tsdoc/syntax": "warn",

		// Unicorn prefer-type-error is stylistic.
		"unicorn/prefer-type-error": "off",

		// Spaced-comment is stylistic, handled by formatter.
		"spaced-comment": "off",

		// JSDoc/TSDoc tag hyphen rule.
		"@fluid-internal/fluid/no-hyphen-after-jsdoc-tag": "off",

		// Import namespace errors may be false positives with some libraries.
		"import-x/namespace": "off",

		// Allow importing eslint in policy check code.
		"import-x/no-extraneous-dependencies": "off",
	},
};

/**
 * The base ESLint flat config from eslint-config-fluid with build-tools overrides.
 */
export const baseConfig = [...minimalDeprecated, buildToolsOverrides];

/**
 * Chai-friendly configuration for test files.
 * Use this in packages that use chai for assertions.
 */
export const chaiFriendlyConfig = {
	plugins: {
		"chai-friendly": chaiFriendly,
	},
	rules: {
		"no-unused-expressions": "off",
		"@typescript-eslint/no-unused-expressions": "off",
		"chai-friendly/no-unused-expressions": "error",
	},
};

export { chaiFriendly };
