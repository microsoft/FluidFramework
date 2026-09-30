/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const AZURE_PORTAL = "https://ms.portal.azure.com";
const CREATE_ROLE_INSTRUCTIONS_URL =
	"https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps#app-roles-ui";
const ASSIGN_ROLE_INSTRUCTIONS_URL =
	"https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/assign-user-or-group-access-portal";

function roleUrls(appId, servicePrincipalObjectId) {
	const createRole = appId
		? `${AZURE_PORTAL}/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/AppRoles/appId/${encodeURIComponent(appId)}/isMSAApp~/false`
		: `${AZURE_PORTAL}/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade`;
	const assignRole =
		appId && servicePrincipalObjectId
			? `${AZURE_PORTAL}/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Users/objectId/${encodeURIComponent(servicePrincipalObjectId)}/appId/${encodeURIComponent(appId)}`
			: `${AZURE_PORTAL}/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview`;
	return { createRole, assignRole };
}

function roleGuidance(role, appId, servicePrincipalObjectId) {
	const urls = roleUrls(appId, servicePrincipalObjectId);
	return [
		`Required role: ${role}`,
		`App registration: ${appId || "(client ID unavailable)"}`,
		`Create/check the role: ${urls.createRole}`,
		`Role creation instructions: ${CREATE_ROLE_INSTRUCTIONS_URL}`,
		`Assign the role to your user/group: ${urls.assignRole}`,
		...(!servicePrincipalObjectId
			? [
					"The service-principal object ID is unavailable; open the enterprise application matching the app registration ID above.",
				]
			: []),
		`Role assignment instructions: ${ASSIGN_ROLE_INSTRUCTIONS_URL}`,
		"After assigning it, sign in again so Entra issues a new access token containing the role.",
	];
}

function formatTokenServicePreflightError(
	error,
	{ tenantId, appId, servicePrincipalObjectId },
) {
	const header = ["Token-service preflight failed before the Fluid scenario started."];
	const message = error.serviceMessage || "";

	if (
		error.status === 403 &&
		message === "Account has not been granted access to this tenant."
	) {
		return [
			...header,
			`Your account is missing write access to Fluid tenant "${tenantId}".`,
			...roleGuidance(`Fluid.${tenantId}.Writer`, appId, servicePrincipalObjectId),
			"Use Users and groups > Add user/group on the enterprise application.",
			"",
			`Service response: ${message}`,
		].join("\n");
	}

	if (
		error.status === 403 &&
		message === "Account has not been granted access to this application."
	) {
		return [
			...header,
			"Your account is missing the service-wide collaborator role.",
			...roleGuidance("FluidCollaborator", appId, servicePrincipalObjectId),
			"",
			`Service response: ${message}`,
		].join("\n");
	}

	const setupGuidance = [
		...header,
		"The token endpoint or App Registration/Easy Auth setup is not working.",
		`App registration: ${appId || "(client ID unavailable)"}`,
		`Review App registration: ${roleUrls(appId, servicePrincipalObjectId).createRole}`,
		"Re-check tools/selfhost/token-service/README.md, especially the exposed Fluid.Token.Issue scope, authorized client, issuer, audience, and Easy Auth settings.",
	];

	if (error.status === 401) {
		setupGuidance.push(
			"Easy Auth rejected the Entra access token. Confirm the token audience/issuer and repeat the scoped Azure login.",
		);
	} else if (error.status === 404 || error.status === 405) {
		setupGuidance.push(
			"The POST /api/token route is missing. Deploy the POST-only token-service version and verify the configured Function App.",
		);
	} else if (error.status === 403) {
		setupGuidance.push(
			"Easy Auth or the selected authorization policy denied access. Check authorized client applications and assigned app roles.",
		);
	} else if (error.status >= 500) {
		setupGuidance.push(
			"The Function App reported a server/configuration failure. Check its health endpoint, app settings, and Key Vault references.",
		);
	} else {
		setupGuidance.push(
			"Confirm that the Function App and App Registration exist and match deploy.parameters.json.",
		);
	}

	setupGuidance.push("", `Original error: ${error.message}`);
	return setupGuidance.join("\n");
}

module.exports = {
	formatTokenServicePreflightError,
};
