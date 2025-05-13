/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [
		require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated"),
		"prettier",
	],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		// Many rules are disabled in PropertyDDS projects. See https://github.com/microsoft/FluidFramework/pull/10272
		"@typescript-eslint/ban-ts-comment": "off",
		"@typescript-eslint/ban-types": "off",
		"@typescript-eslint/consistent-type-definitions": "off",
		"@typescript-eslint/dot-notation": "off",
		"@typescript-eslint/no-dynamic-delete": "off",
		"@typescript-eslint/no-invalid-this": "off",
		"@typescript-eslint/no-empty-interface": "off",
		"@typescript-eslint/no-non-null-assertion": "off",
		"@typescript-eslint/no-require-imports": "off",
		"@typescript-eslint/no-shadow": "off",
		"@typescript-eslint/no-this-alias": "off",
		"@typescript-eslint/no-unnecessary-qualifier": "off",
		"@typescript-eslint/no-unnecessary-type-assertion": "off",
		"@typescript-eslint/no-unsafe-return": "off",
		"@typescript-eslint/no-unused-expressions": "off",
		"@typescript-eslint/no-var-requires": "off",
		"@typescript-eslint/prefer-for-of": "off",
		"@typescript-eslint/prefer-includes": "off",
		"@typescript-eslint/prefer-nullish-coalescing": "off",
		"@typescript-eslint/prefer-optional-chain": "off",
		"@typescript-eslint/prefer-readonly": "off",
		"@typescript-eslint/quotes": "off",
		"@typescript-eslint/restrict-plus-operands": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"@typescript-eslint/unbound-method": "off",
		"eqeqeq": "off",
		"import/no-internal-modules": "off",
		"no-case-declarations": "off",
		"no-inner-declarations": "off",
		"no-multi-spaces": "off",
		"no-param-reassign": "off",
		"no-prototype-builtins": "off",
		"no-useless-escape": "off",
		"no-var": "off",
		"prefer-arrow-callback": "off",
		"prefer-const": "off",
		"prefer-template": "off",
		"quote-props": "off",
		"tsdoc/syntax": "off",
		"unicorn/better-regex": "off",
		"unicorn/filename-case": "off",
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
	},
};
