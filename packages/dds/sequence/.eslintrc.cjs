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
		// #region TODO: Fix violations and remove these rule disables

		"@fluid-internal/fluid/no-unchecked-record-access": "warn",

		"@typescript-eslint/explicit-function-return-type": "warn",
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",

		"prefer-arrow-callback": "off",

		// #endregion
	},
	settings: {
		"import-x/extensions": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
		"import-x/parsers": {
			"@typescript-eslint/parser": [".ts", ".tsx", ".d.ts"],
		},
		"import-x/resolver": {
			typescript: {
				extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
				conditionNames: [
					"allow-ff-test-exports",

					// Default condition names below, see https://www.npmjs.com/package/eslint-import-resolver-typescript#conditionnames
					"types",
					"import",

					// APF: https://angular.io/guide/angular-package-format
					"esm2020",
					"es2020",
					"es2015",

					"require",
					"node",
					"node-addons",
					"browser",
					"default",
				],
			},
		},
	},
};
