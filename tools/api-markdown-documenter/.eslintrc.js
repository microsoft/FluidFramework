/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid/strict")],
	parserOptions: {
		project: ["./tsconfig.json"],
	},
	rules: {
		/**
		 * This package utilizes internals of api-documenter that are not exported by the package root.
		 *
		 * TODO: file issue to expose node types, etc. in main package so we don't need to do this, and have better
		 * guarantees about support.
		 */
		"import/no-internal-modules": [
			"error",
			{
				allow: ["@microsoft/api-documenter/**"],
			},
		],

		"unicorn/prefer-module": "off",
		"unicorn/prefer-negative-index": "off",

		// This package is exclusively used in a Node.js context
		"import/no-nodejs-modules": "off",

		// TODO: remove once dependency on base config has been updated.
		"@typescript-eslint/explicit-member-accessibility": [
			"error",
			{
				accessibility: "explicit",
				overrides: {
					accessors: "explicit",
					constructors: "explicit",
					methods: "explicit",
					properties: "explicit",
					parameterProperties: "explicit",
				},
			},
		],
	},
};
