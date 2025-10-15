/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal-deprecated")],
	rules: {
		"import/no-nodejs-modules": "off",
	},
	parserOptions: {
		project: ["./src/tsconfig.json"],
	},
};
