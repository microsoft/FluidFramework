/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: ["@fluidframework/eslint-config-fluid/eslint7"],
    "parserOptions": {
        "project": ["./tsconfig.json"]
    },
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off",
		"no-null/no-null": "off",
        "import/no-internal-modules": "off",
        "unicorn/filename-case": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/unbound-method": "off"
	},
};
