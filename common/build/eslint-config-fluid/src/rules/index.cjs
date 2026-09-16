/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	rules: {
		"no-file-path-links-in-jsdoc": require("./no-file-path-links-in-jsdoc"),
		"no-hyphen-after-jsdoc-tag": require("./no-hyphen-after-jsdoc-tag"),
		"no-markdown-links-in-jsdoc": require("./no-markdown-links-in-jsdoc"),
		"no-member-release-tags": require("./no-member-release-tags"),
		"no-restricted-tags-imports": require("./no-restricted-tags-imports"),
		"no-unchecked-record-access": require("./no-unchecked-record-access"),
	},
};
