/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	rules: {
		"@rushstack/no-new-null": "off",
		"import/no-nodejs-modules": "off",
		"promise/catch-or-return": ["error", { allowFinally: true }],
		"unicorn/no-null": "off",

		// TODO: fix violations and remove these overrides
		"@typescript-eslint/no-explicit-any": "off",
		"@typescript-eslint/no-unsafe-argument": "off",
		"@typescript-eslint/no-unsafe-assignment": "off",
		"@typescript-eslint/no-unsafe-call": "off",
		"@typescript-eslint/no-unsafe-member-access": "off",
		"@typescript-eslint/no-unsafe-return": "off",
		"@typescript-eslint/restrict-template-expressions": "off",
		"@typescript-eslint/strict-boolean-expressions": "off",
		"unicorn/prefer-node-protocol": "off",
		"unicorn/text-encoding-identifier-case": "off",

		// TODO: enable strict null checks in tsconfig and remove this override
		"@typescript-eslint/prefer-nullish-coalescing": "off",

		// TODO: remove usages of deprecated APIs and remove this override
		"import/no-deprecated": "warn",

		// TODO: fix violations and remove this override
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
	},
};
