#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const { readConfig } = require("../src/config");
const { runScenario } = require("../src/scenario");
const { buildTokenProvider, buildTokenServiceProvider } = require("../src/tokenProvider");
const { formatTokenServicePreflightError } = require("../src/tokenServiceDiagnostics");

async function main() {
	const configPath = process.argv[2];
	if (!configPath) {
		console.error("Usage: deploy-validate.js <path-to-config-file>");
		process.exit(1);
	}
	const { tenantId, endpoints, tokenService } = readConfig(configPath);
	let tokenProviderFactory;
	if (tokenService) {
		const accessToken = process.env.DEPLOY_VALIDATE_ENTRA_ACCESS_TOKEN;
		if (!accessToken) {
			console.error(
				"ERROR: DEPLOY_VALIDATE_ENTRA_ACCESS_TOKEN is not set. Run deploy-validate.sh --token-service so the wrapper can acquire and pass the token.",
			);
			process.exit(1);
		}
		const preflightProvider = buildTokenServiceProvider(
			tokenService.url,
			async () => accessToken,
		);
		console.log("Checking token-service authentication and authorization...");
		try {
			await preflightProvider.fetchOrdererToken(tenantId, "");
			console.log("Token-service preflight passed.\n");
		} catch (error) {
			console.error(
				formatTokenServicePreflightError(error, {
					tenantId,
					appId: tokenService.appId,
					servicePrincipalObjectId: tokenService.servicePrincipalObjectId,
				}),
			);
			process.exit(1);
		}
		tokenProviderFactory = () =>
			buildTokenServiceProvider(tokenService.url, async () => accessToken);
	} else {
		const key = process.env.FLUID_TENANT_KEY;
		if (!key) {
			console.error("ERROR: FLUID_TENANT_KEY environment variable is not set");
			process.exit(1);
		}
		tokenProviderFactory = () => buildTokenProvider(tenantId, key);
	}
	console.log(`Running validation against tenant "${tenantId}"...\n`);

	const results = await runScenario({
		tenantId,
		endpoints,
		tokenProviderFactory,
	});

	let failCount = 0;
	for (const { name, pass, detail } of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
		if (!pass) failCount++;
	}

	console.log("");
	if (failCount === 0) {
		console.log("deploy-validate: all checks passed.");
		process.exit(0);
	} else {
		console.log(`deploy-validate: ${failCount} check(s) failed.`);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("deploy-validate: unexpected error:", err);
	process.exit(1);
});
