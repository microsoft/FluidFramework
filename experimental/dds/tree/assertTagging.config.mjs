/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @type {import("@fluid-tools/build-cli").AssertTaggingPackageConfig}
 */
export default {
	assertionFunctions: {
		// Just tag assert, not `fail` as this package has its own fail utility which is not worth unifying with the common one.
		'assert': 1,
	},
};
