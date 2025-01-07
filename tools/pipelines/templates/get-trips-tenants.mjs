// Copyright (c) Microsoft Corporation and contributors. All rights reserved.
// Licensed under the MIT License.

import fetch from "node-fetch";
// import "OSS.TDFTestLibrary";

// define variables
// stringBearerToken="";


async function main() {
	console.log("set -eu -o pipefail");
	console.log("az login --service-principal -u $servicePrincipalId -p $idToken --tenant $tenantId");
	const requestBody = {
		"Resources": [
			{
				"name": "tenant1", // A user-assigned identifier for the specific resource
				"profileName": "FluidFrameworkTenantPool", // The type of the resource (i.e. pool name)
			},
		],
		"ModuleName": "FFTestModule", // Metadata used for tracking the source of the request (can be anything)
		"Count": 1, // How many copies of the above resources to allocate for the reservation. Should almost always be 1
	};

	const bearerToken = await fetch(
		"https://tdff5prd.office.net/v2.0/reservations/current?isSynthetic=false&durationMinutes=75",
		{
			method: "POST",
			body: JSON.stringify(requestBody),
		},
	).then((response) => response.json());
	console.log(`bearerToken: ${bearerToken}`);
	const stringBearerToken = JSON.stringify(bearerToken);
	console.log(`stringBearerToken: ${stringBearerToken}`);
		// .then((response) => response.json())
		// .then((data) => (stringBearerToken = JSON.stringify(data)));

	// step 2: wait for resource hydration
	// returns "Ready" or "Not Ready"
	const status = await fetch("https://tdff5prd.office.net/v2.0/reservations/current/status", {
		method: "GET",
		headers: {
			// are single quotes needed here in addition to backticks?
			Authorization: `'BEARER ${stringBearerToken}'`,
		},
	}).then((response) => response.json());
	console.log(`status: ${status}`);
	const stringStatus = JSON.stringify(status);
	console.log(`string status ${stringStatus}`);

	// step 3: check out hydrated resource
	const credentials = await fetch(
		"https://tdff5prd.office.net/v2.0/reservations/current/modules?moduleName=FFTestModule",
		{
			method: "GET",
			headers: {
				Authorization: `BEARER ${stringBearerToken}`,
				// don't think this is right
				"TDF-ReservationClient": "odspTests",
			},
		},
	).then((response) => response.json());
	const loginTenants = JSON.stringify(credentials);
	// "
	console.log(`login tenants: ${loginTenants} ; stringbearertoken: ${stringBearerToken}`);
	console.log(`##vso[task.setvariable variable=tenantCreds;issecret=true]${loginTenants}`);
	console.log(`##vso[task.setvariable variable=stringBearerToken;]${stringBearerToken}`);
}

main().then(() => console.log("done"));
