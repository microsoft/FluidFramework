/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

/**
 * Azure Functions binding for the token endpoint.
 *
 * `authLevel` is "anonymous" on purpose. Easy Auth sits in front of this function and rejects
 * unauthenticated requests before any of this code runs, so a function key would add a second,
 * separate credential that authenticates the calling *application* rather than the end user.
 * Browser clients cannot hold one secretly anyway. Authentication is the platform's job here;
 * `src/identity.js` fails closed if that front end is ever missing.
 */

const { app } = require("@azure/functions");

const { loadConfig } = require("../config");
const { selectPolicy } = require("../authorize");
const { handleTokenRequest, RESPONSE_HEADERS } = require("../handler");

// Configuration is read once per worker so a misconfiguration surfaces on the first request
// rather than intermittently. The error is captured instead of thrown to keep the worker alive
// and able to report the problem.
let config;
let configError;
try {
	config = loadConfig();
} catch (error) {
	configError = error;
}

/**
 * The default policy is tenant-blind: it confirms the tenant is served, not that this user
 * belongs to it. With one tenant that is exactly right. With several it means any authenticated
 * user can mint a token for any of them, which is unlikely to be intended and is invisible at
 * runtime — every request simply succeeds. Say so once at startup.
 */
function warnIfTenantBlind(log) {
	if (
		config &&
		config.allowedTenants.length > 1 &&
		selectPolicy(config.authorizationPolicy).isDefaultPolicy
	) {
		log(
			`Serving ${config.allowedTenants.length} tenants (${config.allowedTenants.join(", ")}) ` +
				"with the default authorization policy, which grants every authenticated user access " +
				"to all of them. If these tenants represent different groups of people, switch to " +
				"the tenant-scoped policy: set FLUID_AUTHORIZATION_POLICY=tenant-scoped.",
		);
	}
}

let warned = false;

app.http("token", {
	methods: ["POST"],
	authLevel: "anonymous",
	handler: async (request, context) => {
		if (configError) {
			context.error(`Token service is misconfigured: ${configError.message}`);
			return {
				status: 500,
				headers: RESPONSE_HEADERS,
				// The message names app settings and Key Vault URIs, so it normally stays in the
				// logs. FLUID_DIAGNOSTIC_MODE surfaces it, for environments where the logs are
				// not reachable.
				jsonBody: {
					error: "Token service is misconfigured.",
					...(process.env.FLUID_DIAGNOSTIC_MODE === "true"
						? { detail: configError.message }
						: {}),
				},
			};
		}

		if (!warned) {
			warned = true;
			warnIfTenantBlind((message) => context.warn(message));
		}

		return handleTokenRequest(request, {
			config,
			log: {
				info: (message) => context.log(message),
				warn: (message) => context.warn(message),
			},
		});
	},
});

app.http("health", {
	methods: ["GET"],
	authLevel: "anonymous",
	handler: async () => ({
		status: configError ? 503 : 200,
		headers: RESPONSE_HEADERS,
		jsonBody: { status: configError ? "unhealthy" : "healthy" },
	}),
});
