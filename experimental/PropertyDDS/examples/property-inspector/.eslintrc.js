/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: ["@fluidframework/eslint-config-fluid/minimal", "prettier"],
	parserOptions: {
		project: ["./tsconfig.json"],
	},
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off",
		"import/no-internal-modules": "off",
		"unicorn/filename-case": "off",
		"@typescript-eslint/no-non-null-assertion": "off",
		"@typescript-eslint/unbound-method": "off",
		"import/no-unassigned-import": "off",

		// This library is used in the browser, so we don't want dependencies on most node libraries.
		"import/no-nodejs-modules": ["error", { allow: ["events"] }],
	},
};
