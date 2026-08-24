/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
	formatTokenServicePreflightError,
} = require("../src/tokenServiceDiagnostics");
const { TokenServiceError } = require("../src/tokenProvider");

const context = {
	tenantId: "fluid",
	appId: "00000000-0000-0000-0000-000000000001",
	servicePrincipalObjectId: "00000000-0000-0000-0000-000000000002",
};

test("missing tenant role names the Writer role and assignment pages", () => {
	const error = new TokenServiceError("denied", {
		status: 403,
		serviceMessage: "Account has not been granted access to this tenant.",
	});

	const output = formatTokenServicePreflightError(error, context);

	assert.match(output, /Fluid\.fluid\.Writer/);
	assert.match(output, /App registration:/);
	assert.match(
		output,
		/https:\/\/ms\.portal\.azure\.com\/#view\/Microsoft_AAD_RegisteredApps\/ApplicationMenuBlade\/~\/AppRoles\/appId\/00000000-0000-0000-0000-000000000001\/isMSAApp~\/false/,
	);
	assert.match(
		output,
		/https:\/\/ms\.portal\.azure\.com\/#view\/Microsoft_AAD_IAM\/ManagedAppMenuBlade\/~\/Users\/objectId\/00000000-0000-0000-0000-000000000002\/appId\/00000000-0000-0000-0000-000000000001/,
	);
	assert.match(output, /sign in again/);
});

test("missing service-principal ID falls back to enterprise applications", () => {
	const error = new TokenServiceError("denied", {
		status: 403,
		serviceMessage: "Account has not been granted access to this tenant.",
	});

	const output = formatTokenServicePreflightError(error, {
		tenantId: "fluid",
		appId: context.appId,
	});
	assert.match(output, /StartboardApplicationsMenuBlade/);
	assert.match(output, /service-principal object ID is unavailable/);
});

test("missing service-wide role names FluidCollaborator", () => {
	const error = new TokenServiceError("denied", {
		status: 403,
		serviceMessage:
			"Account has not been granted access to this application.",
	});

	assert.match(
		formatTokenServicePreflightError(error, context),
		/FluidCollaborator/,
	);
});

test("401 points to App Registration and Easy Auth setup", () => {
	const error = new TokenServiceError("Token service returned 401", {
		status: 401,
	});

	const output = formatTokenServicePreflightError(error, context);
	assert.match(output, /App Registration\/Easy Auth setup/);
	assert.match(output, /audience\/issuer/);
	assert.match(output, /token-service\/README\.md/);
});

test("missing POST route reports an outdated or wrong Function App", () => {
	const error = new TokenServiceError("Token service returned 404", {
		status: 404,
	});

	const output = formatTokenServicePreflightError(error, context);
	assert.match(output, /POST \/api\/token route is missing/);
	assert.match(output, /configured Function App/);
});

test("network and discovery failures give generic setup guidance", () => {
	const output = formatTokenServicePreflightError(
		new Error("fetch failed"),
		context,
	);
	assert.match(output, /Function App and App Registration exist/);
	assert.match(output, /Original error: fetch failed/);
});
