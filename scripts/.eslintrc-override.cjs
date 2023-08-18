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

base.rules["import/no-deprecated"] = "error";

module.exports = base;
