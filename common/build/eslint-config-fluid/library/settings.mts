/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Settings for eslint-plugin-import-x.
 */
export const importXSettings = {
	"import-x/extensions": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
	"import-x/parsers": {
		"@typescript-eslint/parser": [".ts", ".tsx", ".d.ts", ".cts", ".mts"],
	},
	"import-x/resolver": {
		typescript: {
			extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
			conditionNames: [
				// This supports the test-only conditional export pattern used in merge-tree and id-compressor.
				"allow-ff-test-exports",
				// Default condition names below
				"types",
				"import",
				// APF: https://angular.io/guide/angular-package-format
				"esm2020",
				"es2020",
				"es2015",
				"require",
				"node",
				"node-addons",
				"browser",
				"default",
			],
		},
	},
};

/**
 * Settings for eslint-plugin-jsdoc.
 */
export const jsdocSettings = {
	jsdoc: {
		// The following are intended to keep js/jsx JSDoc comments in line with TSDoc syntax used in ts/tsx code.
		tagNamePreference: {
			arg: {
				message: "Please use @param instead of @arg.",
				replacement: "param",
			},
			argument: {
				message: "Please use @param instead of @argument.",
				replacement: "param",
			},
			return: {
				message: "Please use @returns instead of @return.",
				replacement: "returns",
			},
		},
	},
};
