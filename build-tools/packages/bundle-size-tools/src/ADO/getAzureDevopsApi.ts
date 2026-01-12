/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { WebApi, getPersonalAccessTokenHandler } from "azure-devops-node-api";

export function getAzureDevopsApi(accessToken: string, orgUrl: string): WebApi {
	const authHandler = getPersonalAccessTokenHandler(accessToken);
	return new WebApi(orgUrl, authHandler);
}
