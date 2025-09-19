/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const importInternalModulesAllowedForTest = [
	// Allow import of Fluid Framework external API exports.
	"@fluidframework/*/{beta,alpha,legacy}",
	"fluid-framework/{beta,alpha,legacy}",

	// Allow import of Fluid Framework non-production test-utils APIs.
	"@fluidframework/*/test-utils",

	// Allow imports from sibling and ancestral sibling directories,
	// but not from cousin directories. Parent is allowed but only
	// because there isn't a known way to deny it.
	"*/index.js",

	// Should `telemetry-utils` provide support through `/test-utils` instead of `/internal`?
	"@fluidframework/telemetry-utils/internal",

	// Should `test-*utils` provide support through `/test-utils` instead of `/internal`?
	"@fluidframework/test-utils/internal",
	"@fluidframework/test-runtime-utils/internal",
];

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	rules: {
		"prefer-arrow-callback": "off",
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig

		// #region TODO: remove these once this config has been updated to use our "recommended" base instead of our deprecated minimal one.
		"@typescript-eslint/consistent-type-exports": [
			"error",
			{ fixMixedExportsWithInlineTypeSpecifier: true },
		],
		"@typescript-eslint/consistent-type-imports": [
			"error",
			{ fixStyle: "inline-type-imports" },
		],
		"@typescript-eslint/no-import-type-side-effects": "error",
		// #endregion
	},
	overrides: [
		{
			// Rules only for test files
			files: ["*.spec.ts", "*.test.ts", "**/test/**"],
			rules: {
				// Some deprecated APIs are permissible in tests; use `warn` to keep them visible
				"import/no-deprecated": "warn",
				"import/no-internal-modules": [
					"error",
					{
						allow: importInternalModulesAllowedForTest,
					},
				],
			},
		},
	],
	parserOptions: {
		project: ["./src/test/tsconfig.json"],
	},
};
