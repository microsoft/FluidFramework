/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Shared list of permitted imports for configuring and override the `import-x/no-internal-modules` rule.
 */
const permittedImports = [
	// Within Fluid Framework allow import of '/internal' from other FF packages.
	"@fluid-example/*/internal",
	"@fluid-experimental/*/internal",
	"@fluid-internal/*/internal",
	"@fluid-private/*/internal",
	"@fluid-tools/*/internal",
	"@fluidframework/*/internal",

	// Experimental package APIs and exports are unknown, so allow any imports from them.
	"@fluid-experimental/**",

	// Allow imports from sibling and ancestral sibling directories,
	// but not from cousin directories. Parent is allowed but only
	// because there isn't a known way to deny it.
	"*/index.js",
];

// Restricted import patterns for all code.
const restrictedImportPaths = [
	// Prefer strict assertions
	// See: <https://nodejs.org/api/assert.html#strict-assertion-mode>
	{
		name: "assert",
		importNames: ["default"],
		message: 'Use `strict` instead. E.g. `import { strict as assert } from "node:assert";`',
	},
	{
		name: "node:assert",
		importNames: ["default"],
		message: 'Use `strict` instead. E.g. `import { strict as assert } from "node:assert";`',
	},
];

// Restricted import patterns for production code.
// Not applied to test code.
const restrictedImportPatternsForProductionCode = [
	// Don't import from the parent index file.
	{
		group: ["./index.js", "**/../index.js"],
		message:
			"Importing from a parent index file tends to cause cyclic dependencies. Import from a more specific sibling file instead.",
	},
];

/**
 * DO NOT USE.
 *
 * This configuration is extended by our `recommended` and `strict` configurations,
 * but this configuration should not be used directly.
 *
 * @deprecated This config is too permissive and should not be used. It will be removed in a future release.
 * Use the "Recommended" or "Strict" configuration instead.
 *
 * @privateRemarks TODO: Once this config is ready for deletion, its rules can be moved into `recommended.js`.
 */
module.exports = {
	env: {
		browser: true,
		es6: true,
		es2024: false,
		node: true,
	},
	extends: ["./base", "prettier"],
	globals: {
		Atomics: "readonly",
		SharedArrayBuffer: "readonly",
	},
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaFeatures: {
			jsx: true,
		},
		ecmaVersion: 2018,
		sourceType: "module",
		project: "./tsconfig.json",
	},
	plugins: [
		// Plugin documentation: https://www.npmjs.com/package/@rushstack/eslint-plugin
		"@rushstack/eslint-plugin",
		// Plugin documentation: https://www.npmjs.com/package/@rushstack/eslint-plugin-security
		"@rushstack/eslint-plugin-security",
		// Plugin documentation: https://www.npmjs.com/package/@typescript-eslint/eslint-plugin
		"@typescript-eslint/eslint-plugin",
		// Plugin documentation: https://www.npmjs.com/package/eslint-plugin-jsdoc
		"eslint-plugin-jsdoc",
		// Plugin documentation: https://www.npmjs.com/package/eslint-plugin-promise
		"eslint-plugin-promise",
		// Plugin documentation: https://www.npmjs.com/package/eslint-plugin-tsdoc
		"eslint-plugin-tsdoc",
		// Plugin documentation: https://www.npmjs.com/package/eslint-plugin-unused-imports
		"unused-imports",
		// Plugin documentation: https://www.npmjs.com/package/eslint-plugin-unicorn
		"unicorn",
		// Custom ESLint rules
		"@fluid-internal/eslint-plugin-fluid",
	],
	reportUnusedDisableDirectives: true,
	ignorePatterns: [
		// Don't lint generated packageVersion files.
		"**/packageVersion.ts",
		"**/layerGenerationState.ts",
		// Don't lint generated test files
		"**/*.generated.ts",
		"**/*.generated.js",
	],
	rules: {
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

		// ENABLED INTENTIONALLY
		"@typescript-eslint/dot-notation": "error",
		"@typescript-eslint/no-non-null-assertion": "error",
		"@typescript-eslint/no-unnecessary-type-assertion": "error",

		"@typescript-eslint/no-restricted-imports": [
			"error",
			{
				paths: restrictedImportPaths,
				patterns: restrictedImportPatternsForProductionCode,
			},
		],

		"eqeqeq": ["error", "smart"],
		"import-x/no-deprecated": "error",
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
		"unicorn/prefer-switch": "error",
		"unicorn/prefer-ternary": "error",
		"unicorn/prefer-type-error": "error",

		// #region DISABLED INTENTIONALLY

		/**
		 * Disabled because we don't require that all variable declarations be explicitly typed.
		 */
		"@rushstack/typedef-var": "off",
		"@typescript-eslint/explicit-function-return-type": "off",
		"@typescript-eslint/explicit-member-accessibility": "off",

		"@typescript-eslint/member-ordering": "off",
		"@typescript-eslint/no-explicit-any": "off",
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

		// Off for minimal and recommended; enabled in the strict config
		"@typescript-eslint/consistent-type-exports": "off",
		"@typescript-eslint/consistent-type-imports": "off",

		"func-call-spacing": "off", // Off because it conflicts with typescript-formatter
		"no-empty": "off",
		"no-void": "off",
		"require-atomic-updates": "off",

		/**
		 * Superseded by `@typescript-eslint/dot-notation`.
		 */
		"dot-notation": "off",

		/**
		 * Superseded by `@typescript-eslint/no-unused-expressions`.
		 */
		"no-unused-expressions": "off",

		// #endregion

		// #region FORMATTING RULES

		// The rules below are deprecated in our current version of eslint/plugins
		"array-bracket-spacing": "off",
		"arrow-spacing": "off",
		"block-spacing": "off",
		"dot-location": "off",
		"jsx-quotes": "off",
		"key-spacing": "off",
		"space-unary-ops": "off",
		"switch-colon-spacing": "off",

		// #endregion

		// #region DOCUMENTATION RULES

		/**
		 * This rule ensures that our Intellisense looks good by verifying the TSDoc syntax.
		 */
		"tsdoc/syntax": "error",

		// #region eslint-plugin-jsdoc rules

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

		// #endregion

		// #endregion

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
	},
	overrides: [
		{
			// Rules only for TypeScript files
			files: ["*.ts", "*.tsx"],
			rules: {
				"dot-notation": "off", // Superseded by @typescript-eslint/dot-notation
				"no-unused-expressions": "off", // Superseded by @typescript-eslint/no-unused-expressions
			},
			settings: {
				jsdoc: {
					mode: "typescript",
				},
			},
		},
		{
			// Rules only for React files
			files: ["*.jsx", "*.tsx"],
			plugins: [
				// Plugin documentation: https://www.npmjs.com/package/eslint-plugin-react
				"react",

				// Plugin documentation: https://www.npmjs.com/package/eslint-plugin-react-hooks
				"react-hooks",
			],
			extends: ["plugin:react/recommended", "plugin:react-hooks/recommended"],
			settings: {
				react: {
					version: "detect",
				},
			},
		},
		{
			// Rules only for test files
			files: [
				"*.spec.ts",
				"*.test.ts",
				"**/test/**",
				// TODO: consider unifying code across the repo to use "test" and not "tests", then we can remove this.
				"**/tests/**",
			],
			rules: {
				"@typescript-eslint/no-invalid-this": "off",
				"@typescript-eslint/unbound-method": "off", // This rule has false positives in many of our test projects.
				"import-x/no-nodejs-modules": "off", // Node libraries are OK for test files.
				"import-x/no-deprecated": "off", // Deprecated APIs are OK to use in test files.

				// Disabled for test files
				"@typescript-eslint/consistent-type-exports": "off",
				"@typescript-eslint/consistent-type-imports": "off",

				"@typescript-eslint/no-restricted-imports": [
					"error",
					{
						paths: restrictedImportPaths,
					},
				],

				// For test files only, additionally allow import of '/test*' and '/internal/test*' exports.
				"import-x/no-internal-modules": [
					"error",
					{
						allow: ["@fluid*/*/test*", "@fluid*/*/internal/test*"].concat(
							permittedImports,
						),
					},
				],

				// Test code may leverage dev dependencies
				"import-x/no-extraneous-dependencies": ["error", { devDependencies: true }],
			},
		},
	],
	settings: {
		jsdoc: {
			// The following are intended to keep js/jsx JSDoc comments in line with TSDoc syntax used in ts/tsx code.
			tagNamePreference: {
				arg: {
					message: "Please use @param instead of @arg.",
					replacement: "param",
				},
				argument: {
					message: "Please use @param instead of @argument.",
					replacement: "param",
				},
				return: {
					message: "Please use @returns instead of @return.",
					replacement: "returns",
				},
			},
		},
	},
};
