/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getPersonalAccessTokenHandler, WebApi } from 'azure-devops-node-api';

export function getAzureDevopsApi(accessToken: string, orgUrl: string) {
  const authHandler = getPersonalAccessTokenHandler(accessToken);
  return new WebApi(orgUrl, authHandler);
}
