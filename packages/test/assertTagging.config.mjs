/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @type {import("@fluid-tools/build-cli").AssertTaggingPackageConfig}
 *
 * TODO: AB#55437: This config file is not working as intended. There is a workaround in top level fluidBuild.config.cjs for now.
 */
export default {
	// Disables assert tagging by listing an empty set of functions that should be tagged.
	assertionFunctions: {},
};
