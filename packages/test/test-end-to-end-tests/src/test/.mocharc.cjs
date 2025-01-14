/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const packageDir = `${__dirname}/../..`;
const getFluidTestMochaConfig = require("@fluid-private/test-version-utils/mocharc-common");
const config = getFluidTestMochaConfig(packageDir);

// TODO: figure out why this package needs the --exit flag, tests might not be cleaning up correctly after themselves.
// AB#7856
config.exit = true;

// Heuristic to decide if we're running against our internal r11s deployment in AKS:
// driver set to 'r11s' + r11sEndpointName set to 'r11s' or not specified at all (if specified with a value other
// than 'r11s' we're probably running against frs or local docker).
const runningAgainstInternalRouterliciousCluster =
	process.argv.includes("--driver=r11s") &&
	(process.argv.includes("r11sEndpointName=r11s") ||
		!process.argv.some((arg) => arg.includes("--r11sEndpointName")));

if (runningAgainstInternalRouterliciousCluster) {
	if (process.platform === "win32") {
		const error =
			"\nRunning our end-to-end tests against the internal routerlicious cluster is not supported on " +
			"Windows because we need our self-signed certificates to be trusted by the machine running the tests, " +
			"and Node has no way to interact with the Windows certificate store.";
		console.error(error);
		process.exit(1);
	}
	const warning =
		"Running tests against the internal routerlicious cluster will only work with the appropriate " +
		"self-signed SSL certificates installed in the local certificate store.\n" +
		"Refer to the team's internal documentation on how to do that.";
	console.warn(warning);

	// Using openssl for certificate authority purposes rather than node's bundled CA allows us to run tests against
	// the deployed r11s cluster in unix environments by installing our self-signed certificates to the local machine's
	// cert store.
	// If this flag is passed on Windows systems, it'll result in an empty certificate store being used, and any
	// http requests done by the node process will fail with something like 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' (see:
	// https://nodejs.org/api/tls.html#x509-certificate-error-codes).
	// The flag used to be passed in the npm script in package.json, but adding node-option to the
	// base mocharc-common.cjs caused it to be ignored, so we need to append it here.
	const baseNodeOptions =
		config["node-option"] !== undefined
			? Array.isArray(config["node-option"])
				? config["node-option"]
				: [config["node-option"]] // If string, wrap with array
			: []; // If undefined, use an empty array

	config["node-option"] = [...baseNodeOptions, "use-openssl-ca"];
}

module.exports = config;
