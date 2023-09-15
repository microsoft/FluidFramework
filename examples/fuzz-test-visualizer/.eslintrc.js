/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
	rules: {
		"import/no-internal-modules": [
			"error",
			{
				allow: ["/view/**"],
			},
		],
	},
	settings: {
		"import/resolver": {
			// Use eslint-import-resolver-typescript.
			// This ensures ESNext with `.js` extensions resolve correctly to their corresponding `.ts` files.
			typescript: {
				extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
			},
		},
	},
};
