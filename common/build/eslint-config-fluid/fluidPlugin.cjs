/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	rules: {
		"no-hyphen-after-jsdoc-tag": require("./rules/no-hyphen-after-jsdoc-tag"),
		"no-file-path-links-in-jsdoc": require("./rules/no-file-path-links-in-jsdoc"),
		"no-markdown-links-in-jsdoc": require("./rules/no-markdown-links-in-jsdoc"),
		"no-member-release-tags": require("./rules/no-member-release-tags"),
		"no-restricted-tags-imports": require("./rules/no-restricted-tags-imports"),
		"no-unchecked-record-access": require("./rules/no-unchecked-record-access"),
	},
};
