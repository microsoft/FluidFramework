/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Recommended ESLint rules.
 *
 * This module contains rules that extend the minimal-deprecated configuration.
 * The recommended config adds stricter type safety rules, unicorn/recommended overrides,
 * and enables rules that were disabled at lower levels. This is the standard config
 * for most Fluid Framework packages.
 */

import type { Linter } from "eslint";

/**
 * Rules from recommended.js.
 */
export const recommendedRules: Linter.RulesRecord = {
	"@rushstack/no-new-null": "error",
	"no-void": "error",
	"require-atomic-updates": "error",

	// #region `unicorn` rule overrides

	// TODO: Enable this rule and fix violations once eslint9 upgrade is done
	"unicorn/consistent-function-scoping": "warn",

	/**
	 * TODO: Consider enabling in the future.
	 */
	"unicorn/import-style": "off",

	// False positives on non-array `push` methods.
	"unicorn/no-array-push-push": "off",

	// False positives on non-array methods.
	"unicorn/no-array-callback-reference": "off",

	"unicorn/empty-brace-spaces": "off",

	// Rationale: Destructuring of `Array.entries()` in order to get the index variable results in a
	// significant performance regression [node 14 x64].
	"unicorn/no-for-loop": "off",

	/**
	 * Disabled because we will lean on the formatter (i.e. prettier) to enforce indentation policy.
	 * @remarks This rule also directly conflicts with prettier's formatting of nested ternary expressions.
	 */
	"unicorn/no-nested-ternary": "off",

	/**
	 * Disabled due to false positives / disruptive behavior of auto-fix.
	 * See {@link https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2018}.
	 * We may consider re-enabling once the above issue has been resolved.
	 */
	"unicorn/no-useless-spread": "off",

	/**
	 * Disabled due to the sheer number of false positives it detects, and because it is sometimes valuable to
	 * explicitly denote `undefined`.
	 */
	"unicorn/no-useless-undefined": "off",

	/**
	 * By default, this rule conflicts with our internal error code formats.
	 * Only enforce `_` separator consistency if any such separators appear in the number literal.
	 */
	"unicorn/numeric-separators-style": ["error", { onlyIfContainsSeparator: true }],

	"unicorn/prevent-abbreviations": "off",

	/**
	 * Enable in a future update; warning for now to surface occurrences without breaking builds.
	 */
	"unicorn/prefer-at": "warn",

	/**
	 * Disabled because we use EventEmitter everywhere today and changing it will be a bigger change outside of lint
	 * rules.
	 */
	"unicorn/prefer-event-target": "off",

	/**
	 * TODO: Enable in a future update; warning for now to surface occurrences without breaking builds.
	 */
	"unicorn/prefer-string-raw": "warn",

	/**
	 * TODO: Enable in a future update; warning for now to surface occurrences without breaking builds.
	 */
	"unicorn/prefer-string-replace-all": "warn",

	/**
	 * TODO: Enable in a future update; warning for now to surface occurrences without breaking builds.
	 */
	"unicorn/prefer-structured-clone": "warn",

	/**
	 * Disabled because we will lean on the formatter (i.e. prettier) to enforce indentation policy.
	 */
	"unicorn/template-indent": "off",

	/**
	 * Disabled because it is incompatible with prettier.
	 */
	"unicorn/number-literal-case": "off",

	/**
	 * The rule seems to crash on some of our code
	 */
	"unicorn/expiring-todo-comments": "off",

	// #endregion

	/**
	 * Disallows the `any` type.
	 * Using the `any` type defeats the purpose of using TypeScript.
	 * When `any` is used, all compiler type checks around that value are ignored.
	 *
	 * @see https://typescript-eslint.io/rules/no-explicit-any
	 */
	"@typescript-eslint/no-explicit-any": [
		"error",
		{
			/**
			 * For certain cases, like rest parameters, any is required to allow arbitrary argument types.
			 * @see https://typescript-eslint.io/rules/no-explicit-any/#ignorerestargs
			 */
			ignoreRestArgs: true,
		},
	],

	/**
	 * Requires explicit typing for anything exported from a module. Explicit types for function return
	 * values and arguments makes it clear to any calling code what is the module boundary's input and
	 * output.
	 */
	"@typescript-eslint/explicit-module-boundary-types": "error",

	/**
	 * Disallows calling a function with a value with type `any`.
	 * Despite your best intentions, the `any` type can sometimes leak into your codebase.
	 * Call a function with `any` typed argument are not checked at all by TypeScript, so it creates a
	 * potential safety hole, and source of bugs in your codebase.
	 */
	"@typescript-eslint/no-unsafe-argument": "error",

	/**
	 * Disallows assigning any to a variable, and assigning any[] to an array destructuring. Assigning an
	 * any typed value to a variable can be hard to pick up on, particularly if it leaks in from an external
	 * library.
	 */
	"@typescript-eslint/no-unsafe-assignment": "error",

	/**
	 * Disallows calling any variable that is typed as any. The arguments to, and return value of calling an
	 * `any`-typed variable are not checked at all by TypeScript.
	 */
	"@typescript-eslint/no-unsafe-call": "error",

	/**
	 * Disallows member access on any variable that is typed as any. The arguments to, and return value of
	 * calling an `any`-typed variable are not checked at all by TypeScript.
	 */
	"@typescript-eslint/no-unsafe-member-access": "error",

	/**
	 * Disallows returning a value with type any from a function.
	 *
	 * Despite your best intentions, the any type can sometimes leak into your codebase.
	 * Returned any typed values are not checked at all by TypeScript, so it creates a potential safety
	 * hole, and source of bugs in your codebase.
	 */
	"@typescript-eslint/no-unsafe-return": "error",

	// #region eslint-plugin-jsdoc rules

	/**
	 * Require the description (summary) component in JSDoc/TSDoc comments
	 * See <https://github.com/gajus/eslint-plugin-jsdoc#user-content-eslint-plugin-jsdoc-rules-require-description>
	 */
	"jsdoc/require-description": ["error", { checkConstructors: false }],

	/**
	 * Requires that type-only exports be done using `export type`. Being explicit allows the TypeScript
	 * `isolatedModules` flag to be used, and isolated modules are needed to adopt modern build tools like swc.
	 *
	 * @see {@link https://typescript-eslint.io/rules/consistent-type-exports/}
	 */
	"@typescript-eslint/consistent-type-exports": [
		"error",
		{
			// Makes it easier to tell, at a glance, the impact of a change to individual exports.
			fixMixedExportsWithInlineTypeSpecifier: true,
		},
	],

	/**
	 * Requires that type-only imports be done using `import type`. Being explicit allows the TypeScript
	 * `isolatedModules` flag to be used, and isolated modules are needed to adopt modern build tools like swc.
	 *
	 * @see {@link https://typescript-eslint.io/rules/consistent-type-imports/}
	 */
	"@typescript-eslint/consistent-type-imports": [
		"error",
		{ fixStyle: "separate-type-imports" },
	],

	// #endregion
};
