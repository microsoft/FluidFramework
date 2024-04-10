/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict"), "prettier"],
	parserOptions: {
		// TODO: why does tree package not have to list test config here?
		project: ["./tsconfig.json", "./src/test/tsconfig.json"],
	},
};
