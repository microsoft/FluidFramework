/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * To override the eslint config, use the following command to copy the override config to every package:
 *
 * flub exec -g client -- "cp ABSOLUTE_REPO_PATH/scripts/.eslintrc-override.cjs ."
 */
const base = require("./.eslintrc.js");

if (base.rules === undefined) {
	base.rules = {};
}

if (base.overrides === undefined) {
	base.overrides = [];
}


base.rules["import/no-deprecated"] = "error";

base.overrides.push({
	// Rules only for test files
	files: ["*.spec.ts", "src/test/**"],
	rules: {
		"@typescript-eslint/no-invalid-this": "off",
		"@typescript-eslint/unbound-method": "off", // This rule has false positives in many of our test projects.
		"import/no-nodejs-modules": "off", // Node libraries are OK for test files.
		"import/no-deprecated": "off", // Deprecated APIs are OK to use in test files.
	},
});

module.exports = base;
