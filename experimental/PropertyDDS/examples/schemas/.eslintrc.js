/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: ["@fluidframework/eslint-config-fluid"],
    "parserOptions": {
        "project": ["./tsconfig.json"]
    },
	rules: {
		"@typescript-eslint/strict-boolean-expressions": "off",
        "unicorn/filename-case": "off",
        "import/no-default-export": "off",
	},
};
