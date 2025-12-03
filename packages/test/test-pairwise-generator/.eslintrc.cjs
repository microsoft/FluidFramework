/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: ["@fluidframework/eslint-config-fluid/minimal-deprecated", "prettier"],
	rules: {
		"@fluid-internal/fluid/no-unchecked-record-access": "warn",
	},
};
