/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: ["@fluidframework/eslint-config-fluid/minimal-deprecated", "prettier"],
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
	},
};
