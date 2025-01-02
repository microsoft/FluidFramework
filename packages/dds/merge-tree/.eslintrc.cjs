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
		"@typescript-eslint/no-use-before-define": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"keyword-spacing": "off", // Off because it conflicts with typescript-formatter
		"no-case-declarations": "off",
		"prefer-arrow/prefer-arrow-functions": "off",
		"unicorn/no-useless-spread": "off", // Off because it generates incorrect code in autofixes and cannot distinguish useful copies of arrays from useless ones
		"@fluid-internal/fluid/no-unchecked-record-access": "error",
	},
};
