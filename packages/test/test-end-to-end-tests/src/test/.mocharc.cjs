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
// Using openssl for certificate authority purposes rather than node's bundled CA allows us to run tests against
// the deployed r11s cluster in unix environments.
// However, without additional configuration, this option on windows results in tests running with an empty root cert store,
// which causes problems for other e2e tests (ex: those against odsp) such as 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', see:
// https://nodejs.org/api/tls.html#x509-certificate-error-codes
if (process.platform !== "win32") {
	if (config["node-option"] === undefined) {
		config["node-option"] = "use-openssl-ca";
	} else {
		config["node-option"] += ",use-openssl-ca";
	}
}

module.exports = config;
