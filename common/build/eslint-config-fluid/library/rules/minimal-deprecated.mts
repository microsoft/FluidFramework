/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Minimal-deprecated ESLint rules.
 *
 * This module contains rules that extend the base configuration. The "minimal-deprecated"
 * configuration is the lightest recommended config and serves as the foundation for
 * the recommended and strict configs. It includes additional TypeScript rules, JSDoc/TSDoc
 * validation, import restrictions, and Fluid-specific custom rules.
 */

import type { Linter } from "eslint";

import {
	restrictedImportPaths,
	restrictedImportPatternsForProductionCode,
	permittedImports,
} from "../constants.mjs";

/**
 * Rules from minimal-deprecated.js.
 */
export const minimalDeprecatedRules = {
	/**
	 * Disable max-len as it conflicts with biome formatting.
	 */
	"max-len": "off",

	/**
	 * Restricts including release tags inside the member class / interface.
	 *
	 * Refer to the rule by the unprefixed plugin name in the consumed package.
	 * {@link https://eslint.org/docs/latest/extend/plugins#rules-in-plugins}
	 */
	"@fluid-internal/fluid/no-member-release-tags": "error",

	/**
	 * Rule to enforce safe property access on index signature types.
	 *
	 * Reports issues when non-array index properties are accessed without handling
	 * the possibility that they are absent.
	 * Enabling `noUncheckedIndexedAccess` will disable these checks.
	 */
	"@fluid-internal/fluid/no-unchecked-record-access": "error",

	/**
	 * The @rushstack rules are documented in the package README:
	 * {@link https://www.npmjs.com/package/@rushstack/eslint-plugin}
	 */
	"@rushstack/no-new-null": "warn",

	/**
	 * RATIONALE: Harmless.
	 *
	 * Our guideline is to only use leading underscores on private members when required to avoid a conflict
	 * between private fields and a public property.
	 *
	 * Docs: {@link https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/naming-convention.md}
	 */
	"@typescript-eslint/naming-convention": [
		"error",
		{
			selector: "accessor",
			modifiers: ["private"],
			format: ["camelCase"],
			leadingUnderscore: "allow",
		},
	],

	/**
	 * Encourages minimal disabling of eslint rules, while still permitting whole-file exclusions.
	 */
	"@eslint-community/eslint-comments/disable-enable-pair": [
		"error",
		{
			allowWholeFile: true,
		},
	],

	"@typescript-eslint/dot-notation": "error",
	"@typescript-eslint/no-non-null-assertion": "error",
	"@typescript-eslint/no-unnecessary-type-assertion": "error",

	// In some cases, type inference can be wrong, and this can cause a "flip-flop" of type changes in our
	// API documentation. For example, type inference might decide a function returns a concrete type
	// instead of an interface. This has no runtime impact, but would cause compilation problems.
	"@typescript-eslint/explicit-function-return-type": [
		"error",
		{
			allowExpressions: true,
			allowTypedFunctionExpressions: true,
			allowHigherOrderFunctions: true,
			allowDirectConstAssertionInArrowFunctions: true,
			allowConciseArrowFunctionExpressionsStartingWithVoid: false,
		},
	],

	"@typescript-eslint/no-restricted-imports": [
		"error",
		{
			paths: restrictedImportPaths,
			patterns: restrictedImportPatternsForProductionCode,
		},
	],

	"eqeqeq": ["error", "smart"],
	"import-x/no-deprecated": "error",
	"no-empty": "error",
	"no-multi-spaces": [
		"error",
		{
			ignoreEOLComments: true,
		},
	],

	/**
	 * Note: this can be replaced altogether by `@typescript-eslint/no-unused-vars`,
	 * but that rule covers many more scenarios than this one does, and there are many violations
	 * currently in the repository, so it has not been enabled yet.
	 */
	"unused-imports/no-unused-imports": "error",

	"no-void": "warn",
	"require-atomic-updates": "warn",
	"valid-typeof": "error",

	/**
	 * Catches a common coding mistake where "resolve" and "reject" are confused.
	 */
	"promise/param-names": "warn",

	"unicorn/better-regex": "error",
	"unicorn/filename-case": [
		"error",
		{
			cases: {
				camelCase: true,
				pascalCase: true,
			},
		},
	],
	"unicorn/no-new-buffer": "error",

	/**
	 * Warns if separators are inconsistent in number literals that contain separators.
	 */
	"unicorn/numeric-separators-style": ["warn", { onlyIfContainsSeparator: true }],

	"unicorn/prefer-switch": "error",
	"unicorn/prefer-ternary": "error",
	"unicorn/prefer-type-error": "error",

	/**
	 * Note: will be promoted to an error in the future.
	 */
	"@typescript-eslint/consistent-type-exports": [
		"warn",
		{
			fixMixedExportsWithInlineTypeSpecifier: true,
		},
	],

	/**
	 * Enforces consistent usage of `import type` for type-only imports.
	 *
	 * This helps clearly separate types from runtime values, which can improve readability,
	 * support for tree-shaking and bundling, and aligns with modern TypeScript best practices.
	 *
	 * @remarks
	 * Note: this will be promoted to "error" in a future release.
	 *
	 * Docs: {@link https://typescript-eslint.io/rules/consistent-type-imports/}
	 */
	"@typescript-eslint/consistent-type-imports": ["warn", { fixStyle: "inline-type-imports" }],

	/**
	 * Requires explicit typing for anything exported from a module.
	 * @remarks Note: this will be promoted to "error" in a future release.
	 */
	"@typescript-eslint/explicit-module-boundary-types": "warn",

	/**
	 * Disallows the explicit use of the `any` type.
	 * @remarks Note: this will be promoted to "error" in a future release.
	 */
	"@typescript-eslint/no-explicit-any": [
		"warn",
		{
			ignoreRestArgs: true,
		},
	],

	/**
	 * Disallows calling a function with a value with type `any`.
	 * @remarks Note: this will be promoted to "error" in a future release.
	 */
	"@typescript-eslint/no-unsafe-argument": "warn",

	/**
	 * Disallows assigning any to a variable.
	 * @remarks Note: this will be promoted to "error" in a future release.
	 */
	"@typescript-eslint/no-unsafe-assignment": "warn",

	/**
	 * Disallows calling any variable that is typed as any.
	 * @remarks Note: this will be promoted to "error" in a future release.
	 */
	"@typescript-eslint/no-unsafe-call": "warn",

	/**
	 * Disallows member access on any variable that is typed as any.
	 * @remarks Note: this will be promoted to "error" in a future release.
	 */
	"@typescript-eslint/no-unsafe-member-access": "warn",

	/**
	 * Disallows returning a value with type any from a function.
	 * @remarks Note: this will be promoted to "error" in a future release.
	 */
	"@typescript-eslint/no-unsafe-return": "warn",

	/**
	 * Disabled because we don't require that all variable declarations be explicitly typed.
	 */
	"@rushstack/typedef-var": "off",

	"@typescript-eslint/explicit-member-accessibility": "off",
	"@typescript-eslint/member-ordering": "off",
	"@typescript-eslint/no-unused-vars": "off",
	"@typescript-eslint/no-use-before-define": "off",
	"@typescript-eslint/typedef": "off",

	/**
	 * Disabled because we want to encourage documenting different events separately.
	 */
	"@typescript-eslint/unified-signatures": "off",

	// Requires a lot of changes
	"@typescript-eslint/no-duplicate-type-constituents": "off",

	// Lots of false positives
	"@typescript-eslint/non-nullable-type-assertion-style": "off",

	// Requires breaking changes; enabled in the strict config
	"@typescript-eslint/consistent-indexed-object-style": "off",

	// Requires a lot of changes; enabled in the strict config
	"@typescript-eslint/no-unsafe-enum-comparison": "off",

	// Requires a lot of changes; enabled in the strict config
	"@typescript-eslint/no-redundant-type-constituents": "off",

	// Requires a lot of changes; enabled in the strict config
	"@typescript-eslint/consistent-generic-constructors": "off",

	"func-call-spacing": "off", // Off because it conflicts with typescript-formatter

	/**
	 * Superseded by `@typescript-eslint/dot-notation`.
	 */
	"dot-notation": "off",

	/**
	 * Superseded by `@typescript-eslint/no-unused-expressions`.
	 */
	"no-unused-expressions": "off",

	// Deprecated formatting rules
	"array-bracket-spacing": "off",
	"arrow-spacing": "off",
	"block-spacing": "off",
	"dot-location": "off",
	"jsx-quotes": "off",
	"key-spacing": "off",
	"space-unary-ops": "off",
	"switch-colon-spacing": "off",

	/**
	 * This rule ensures that our Intellisense looks good by verifying the TSDoc syntax.
	 */
	"tsdoc/syntax": "error",

	/**
	 * Ensures that conflicting access tags don't exist in the same comment.
	 * See <https://github.com/gajus/eslint-plugin-jsdoc#check-access>.
	 */
	"jsdoc/check-access": "error",

	/**
	 * Ensures consistent line formatting in JSDoc/TSDoc comments
	 * See <https://github.com/gajus/eslint-plugin-jsdoc#user-content-eslint-plugin-jsdoc-rules-check-alignment>
	 *
	 * TODO: This is temporarily set to "warn" because there are a lot of false positives with code blocks in
	 * particular.
	 */
	"jsdoc/check-line-alignment": "warn",

	/**
	 * The syntax this validates does not accommodate the syntax used by API-Extractor
	 * See <https://api-extractor.com/pages/tsdoc/tag_example/>
	 */
	"jsdoc/check-examples": "off",

	/**
	 * Ensures correct indentation within JSDoc/TSDoc comment body
	 * See <https://github.com/gajus/eslint-plugin-jsdoc#user-content-eslint-plugin-jsdoc-rules-check-indentation>
	 */
	"jsdoc/check-indentation": "error",

	/**
	 * Covered by `tsdoc/syntax`
	 */
	"jsdoc/check-tag-names": "off",

	/**
	 * Ensures that JSDoc/TSDoc "modifier" tags are empty.
	 * See <https://github.com/gajus/eslint-plugin-jsdoc#user-content-eslint-plugin-jsdoc-rules-empty-tags>
	 */
	"jsdoc/empty-tags": "error",

	/**
	 * Ensures JSDoc/TSDoc comments to use the consistent formatting.
	 * See {@link https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/multiline-blocks.md}
	 */
	"jsdoc/multiline-blocks": ["error"],

	/**
	 * Ensures multi-line formatting meets JSDoc/TSDoc requirements.
	 * See <https://github.com/gajus/eslint-plugin-jsdoc#user-content-eslint-plugin-jsdoc-rules-no-bad-blocks>
	 */
	"jsdoc/no-bad-blocks": "error",

	/**
	 * Requires that each line in a JSDoc/TSDoc comment starts with a `*`.
	 * See <https://github.com/gajus/eslint-plugin-jsdoc#user-content-eslint-plugin-jsdoc-rules-require-asterisk-prefix>
	 */
	"jsdoc/require-asterisk-prefix": "error",

	/**
	 * Ensure function/method parameter comments include a `-` between name and description.
	 * Useful to ensure API-Extractor compatability.
	 * See <https://github.com/gajus/eslint-plugin-jsdoc#user-content-eslint-plugin-jsdoc-rules-require-hyphen-before-param-description>.
	 */
	"jsdoc/require-hyphen-before-param-description": "error",

	/**
	 * Require `@param` tags be non-empty.
	 * See <https://github.com/gajus/eslint-plugin-jsdoc#user-content-eslint-plugin-jsdoc-rules-require-param-description>
	 */
	"jsdoc/require-param-description": "error",

	/**
	 * Requires `@returns` tags to be non-empty.
	 * See <https://github.com/gajus/eslint-plugin-jsdoc#user-content-eslint-plugin-jsdoc-rules-require-returns-description>
	 */
	"jsdoc/require-returns-description": "error",

	/**
	 * Ensures that type-only import statements do not result in runtime side-effects.
	 *
	 * @see {@link https://typescript-eslint.io/rules/no-import-type-side-effects/}
	 */
	"@typescript-eslint/no-import-type-side-effects": "error",

	"@typescript-eslint/prefer-includes": "error",
	"@typescript-eslint/prefer-nullish-coalescing": "error",
	"@typescript-eslint/prefer-optional-chain": "error",

	/**
	 * By default, libraries should not take dependencies on node libraries.
	 * This rule can be disabled at the project level for libraries that are intended to be used only in node.
	 */
	"import-x/no-nodejs-modules": ["error"],

	/**
	 * Allow Fluid Framework to import from its own internal packages.
	 * https://github.com/un-ts/eslint-plugin-import-x/blob/master/docs/rules/no-internal-modules.md
	 */
	"import-x/no-internal-modules": [
		"error",
		{
			allow: permittedImports,
		},
	],
} as const satisfies Linter.RulesRecord;
