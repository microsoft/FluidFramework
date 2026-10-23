/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { createRequire } = require("node:module");

const entryPoint = require.resolve("tinylicious");
if (process.env.FLUID_TINYLICIOUS_DIAGNOSTICS === "1") {
	const tinyliciousRequire = createRequire(entryPoint);
	const { installDiagnostics } = require("./tinyliciousDiagnostics.cjs");
	installDiagnostics({
		git: tinyliciousRequire("isomorphic-git"),
		tinyliciousVersion: tinyliciousRequire("../package.json").version,
	});
}
require(entryPoint);
