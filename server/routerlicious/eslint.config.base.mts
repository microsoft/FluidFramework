/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared ESLint configuration for server/routerlicious packages.
 *
 * This module re-exports the minimalDeprecated config from @fluidframework/eslint-config-fluid
 * and provides additional utilities for routerlicious-specific needs.
 */

import { minimalDeprecated, recommended } from "@fluidframework/eslint-config-fluid/flat.mts";

/**
 * Routerlicious-specific rule overrides.
 * These packages are server-side Node.js services.
 */
const routerliciousOverrides = {
	rules: {
		// Routerlicious packages are server-side Node.js code that legitimately uses Node built-in modules.
		"import-x/no-nodejs-modules": "off",

		// Allow finally blocks in promise chains.
		"promise/catch-or-return": ["error", { allowFinally: true }],

		// Import ordering is handled by Prettier.
		"import-x/order": "off",

		// This rule is too strict for server code.
		// TODO: Consider enabling and fixing violations.
		"@typescript-eslint/strict-boolean-expressions": "off",

		// TODO: enable strict null checks in tsconfig and remove this override
		"@typescript-eslint/prefer-nullish-coalescing": "off",

		// TODO: remove usages of deprecated APIs and remove this override
		"import-x/no-deprecated": "warn",

		// Build-tools uses @deprecated internally for deprecation warnings.
		// Keep as warning to track usage, but don't fail the build.
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",

		// JSDoc hyphen rules are stylistic.
		"jsdoc/require-hyphen-before-param-description": "off",
		"jsdoc/require-param-description": "off",

		// TSDoc hyphen rule.
		"tsdoc/syntax": "warn",

		// Unicorn prefer-type-error is stylistic.
		"unicorn/prefer-type-error": "off",

		// Spaced-comment is stylistic, handled by formatter.
		"spaced-comment": "off",

		// Prefer template literals is stylistic.
		"prefer-template": "off",

		// Import namespace errors may be false positives with some libraries.
		"import-x/namespace": "off",
	},
};

/**
 * The base ESLint flat config from eslint-config-fluid with routerlicious overrides.
 * Uses minimalDeprecated config (what most packages use).
 */
export const baseConfig = [...minimalDeprecated, routerliciousOverrides];

/**
 * The recommended ESLint flat config with routerlicious overrides.
 * For packages that were using the full recommended config (gitresources, lambdas).
 */
export const recommendedConfig = [...recommended, routerliciousOverrides];
