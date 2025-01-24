/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Copied over from common/build/eslint-config-fluid/minimal-deprecated.js,
 * since we need to add more entries in this package but don't want to lose these.
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

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	rules: {
		"prefer-arrow-callback": "off",
		"@typescript-eslint/strict-boolean-expressions": "off", // requires strictNullChecks=true in tsconfig
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		"import/no-internal-modules": [
			"error",
			{
				// So we can import SharedMap
				allow: [...permittedImports, "fluid-framework/legacy"],
			},
		],
	},
	parserOptions: {
		project: ["./src/test/tsconfig.json"],
	},
};
