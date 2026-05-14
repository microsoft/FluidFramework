/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getPersonalAccessTokenHandler, WebApi } from "azure-devops-node-api";

type AuthHandler = ConstructorParameters<typeof WebApi>[1];

/**
 * Request handler that sends no `Authorization` header. Enables anonymous reads against
 * public ADO projects (e.g. `dev.azure.com/fluidframework/public`) without requiring a
 * token. Used when no access token is available — including fork PR pipeline runs, where
 * `$(System.AccessToken)` is not populated and sending an empty PAT produces a 401.
 */
const anonymousRequestHandler: AuthHandler = {
	prepareRequest(): void {
		// no-op: intentionally leave the request unauthenticated
	},
	canHandleAuthentication(): boolean {
		return false;
	},
	async handleAuthentication(): Promise<never> {
		throw new Error("anonymous handler cannot satisfy an authentication challenge");
	},
};

/**
 * Construct a WebApi client for an Azure DevOps organization.
 *
 * @param accessToken - PAT or `System.AccessToken`. When `undefined` or empty, returns a
 * client that makes anonymous requests (suitable for public projects).
 * @param orgUrl - Base URL of the ADO organization.
 */
export function getAzureDevopsApi(accessToken: string | undefined, orgUrl: string): WebApi {
	const authHandler =
		accessToken !== undefined && accessToken !== ""
			? getPersonalAccessTokenHandler(accessToken)
			: anonymousRequestHandler;
	return new WebApi(orgUrl, authHandler);
}
