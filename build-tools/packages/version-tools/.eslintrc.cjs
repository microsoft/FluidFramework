/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	parserOptions: {
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
	rules: {
		// We use semver classes a lot in this package, and they stringify without issue but this rule is still triggered,
		// so disabling.
		"@typescript-eslint/no-base-to-string": "off",

		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",

		// This package is exclusively used in a Node.js context
		"import-x/no-nodejs-modules": "off",

		// Rules that moved from eslint-plugin-import to eslint-plugin-import-x
		"import/no-default-export": "off",
		"import/no-deprecated": "off",
		"import/no-named-as-default-member": "off",
	},
};
