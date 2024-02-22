/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	rules: {
		"no-member-release-tags": require("./src/rules/no-member-release-tags"),
		"no-restricted-tags-imports": require("./src/rules/no-restricted-tags-imports"),
	},
};
