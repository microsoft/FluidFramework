/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * ESLint configuration for Fluid Framework server packages.
 *
 * Server packages (routerlicious, gitrest, historian) are Node.js services with
 * different requirements than client-side code. This config provides appropriate
 * rule overrides for server code.
 *
 * @example
 * ```typescript
 * // In your eslint.config.mts
 * import { server } from "@fluidframework/eslint-config-fluid/server.mts";
 * export default [...server];
 * ```
 */

import { minimalDeprecated } from "./flat.mts";

/**
 * Server-specific rule overrides.
 * These packages are server-side Node.js services.
 *
 * Many rules are disabled with TODOs to re-enable them after fixing violations.
 * The server codebase predates many of these stricter TypeScript rules.
 */
const serverOverrides = {
	rules: {
		// Server packages are server-side Node.js code that legitimately uses Node built-in modules.
		"import-x/no-nodejs-modules": "off",

		// Allow finally blocks in promise chains.
		// Server code has patterns where catch throws, which this rule doesn't understand.
		// TODO: Review and re-enable with appropriate configuration.
		"promise/catch-or-return": "off",

		// Import ordering is handled by the formatter.
		"import-x/order": "off",

		// #region TypeScript strict rules - disabled for server code migration
		// TODO: Fix violations and re-enable these rules incrementally.

		// This rule is too strict for server code - many implicit boolean coercions.
		"@typescript-eslint/strict-boolean-expressions": "off",

		// Server code has many functions without explicit return types.
		// TODO: Add return types and re-enable as error.
		"@typescript-eslint/explicit-function-return-type": "off",

		// Related to explicit-function-return-type - covers module boundaries.
		// TODO: Add return types and re-enable as error.
		"@typescript-eslint/explicit-module-boundary-types": "off",

		// Server code has extensive use of `any` types.
		// TODO: Replace `any` with proper types and re-enable as error.
		"@typescript-eslint/no-explicit-any": "off",

		// These rules flag unsafe usage of `any` typed values.
		// TODO: Fix type safety issues and re-enable as errors.
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
		"@typescript-eslint/no-unsafe-return": "off",

		// #endregion

		// TODO: enable strict null checks in tsconfig and remove this override
		"@typescript-eslint/prefer-nullish-coalescing": "off",

		// TODO: remove usages of deprecated APIs and remove this override
		"import-x/no-deprecated": "warn",

		// Keep as warning to track usage, but don't fail the build.
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",

		// JSDoc hyphen rules are stylistic.
		"jsdoc/require-hyphen-before-param-description": "off",
		"jsdoc/require-param-description": "off",

		// TSDoc hyphen rule.
		// TODO: Change this to error.
		"tsdoc/syntax": "warn",

		// Unicorn prefer-type-error is stylistic.
		"unicorn/prefer-type-error": "off",

		// Spaced-comment is stylistic, handled by formatter.
		"spaced-comment": "off",

		// Prefer template literals is stylistic.
		"prefer-template": "off",

		// Import namespace errors may be false positives with some libraries.
		"import-x/namespace": "off",

		// Workspace packages can't be resolved without building first.
		// TODO: Configure import-x resolver for pnpm workspaces if needed.
		"import-x/no-unresolved": "off",

		// #region Additional rules disabled for server code migration
		// TODO: Fix violations and re-enable these rules.

		// Server code has many unhandled promises - needs cleanup.
		"@typescript-eslint/no-floating-promises": "off",

		// Lodash/body-parser are used throughout server code.
		// TODO: Migrate to alternatives as recommended.
		"depend/ban-dependencies": "off",

		// Server code uses type assertions extensively.
		// TODO: Refactor to use type guards or proper typing.
		"@typescript-eslint/consistent-type-assertions": "off",

		// Server code has functions returning promises that aren't marked async.
		// TODO: Add async keyword where appropriate.
		"@typescript-eslint/promise-function-async": "off",

		// Server code uses promises in contexts expecting void.
		// TODO: Fix promise handling.
		"@typescript-eslint/no-misused-promises": "off",

		// Server code has some instances that prefer bracket notation.
		"@typescript-eslint/dot-notation": "off",

		// Server code has relative imports reaching into sibling packages.
		// TODO: Refactor to use package imports.
		"import-x/no-internal-modules": "off",

		// Prefer const over let.
		// TODO: Fix let declarations that should be const.
		"prefer-const": "warn",

		// Server code uses non-null assertions.
		// TODO: Add proper null checks.
		"@typescript-eslint/no-non-null-assertion": "off",

		// Server code has await on non-promises.
		"@typescript-eslint/await-thenable": "off",

		// Server code has unused expressions.
		"@typescript-eslint/no-unused-expressions": "off",

		// Server code uses bitwise operators legitimately.
		"no-bitwise": "off",

		// Server code uses comma operators.
		"no-sequences": "off",

		// Server code has unnecessary type assertions.
		"@typescript-eslint/no-unnecessary-type-assertion": "off",

		// Server code uses prefer-arrow-callback style.
		"prefer-arrow-callback": "off",

		// Server code uses regex exec vs test inconsistently.
		"@typescript-eslint/prefer-regexp-exec": "off",

		// Server code has one-var style.
		"one-var": "off",

		// Server code has prefer-promise-reject-errors issues.
		"@typescript-eslint/prefer-promise-reject-errors": "off",

		// Named exports from default.
		"import-x/no-named-as-default-member": "off",

		// Rule was renamed in newer versions.
		"@typescript-eslint/no-throw-literal": "off",

		// Variable shadowing in server code.
		// TODO: Rename shadowed variables.
		"@typescript-eslint/no-shadow": "off",

		// JSDoc hyphen formatting.
		"@fluid-internal/fluid/no-hyphen-after-jsdoc-tag": "off",

		// Assert import style.
		// TODO: Update to use strict assert.
		"@typescript-eslint/no-restricted-imports": "off",

		// Ternary expression preference.
		"unicorn/prefer-ternary": "off",

		// Spread vs concat preference.
		"unicorn/prefer-spread": "off",

		// Promise catch-or-return is handled by our custom config.
		// Some patterns legitimately don't need explicit returns.
		// TODO: Review and enable where appropriate.

		// Type definition style.
		"@typescript-eslint/consistent-type-definitions": "off",

		// Object shorthand style.
		"object-shorthand": "off",

		// Empty blocks may be intentional.
		"no-empty": "off",

		// Optional chain preference.
		"@typescript-eslint/prefer-optional-chain": "off",

		// Type side effects - import type handling.
		"@typescript-eslint/no-import-type-side-effects": "off",

		// Base to string conversion warnings.
		"@typescript-eslint/no-base-to-string": "off",

		// Parameter reassignment in server code.
		"no-param-reassign": "off",

		// Strict equality - some legacy code uses ==.
		// TODO: Fix to use ===.
		eqeqeq: "off",

		// Return-await style - server code uses various patterns.
		// TODO: Standardize on in-try-catch style.
		"@typescript-eslint/return-await": "off",

		// #endregion
	},
};

/**
 * ESLint flat config for server packages.
 * Uses minimalDeprecated config with server-specific rule overrides.
 */
export const server = [...minimalDeprecated, serverOverrides];
