/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const packageDir = `${__dirname}/../..`;
const getFluidTestMochaConfig = require("@fluid-private/test-version-utils/mocharc-common");
const config = getFluidTestMochaConfig(packageDir);

// The 'use-openssl-ca' node option used to be passed as a flag in the npm script in package.json, but
// adding node-option to the base mocharc-common.cjs caused it to be ignored, so we need to append it here.
if (config["node-option"] === undefined) {
	config["node-option"] = "use-openssl-ca";
} else {
	config["node-option"] += ",use-openssl-ca";
}

module.exports = config;
