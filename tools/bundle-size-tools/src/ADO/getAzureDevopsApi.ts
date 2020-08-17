/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getPersonalAccessTokenHandler, WebApi } from 'azure-devops-node-api';
import { Constants } from './Constants';

export function getAzureDevopsApi(accessToken: string) {
  const authHandler = getPersonalAccessTokenHandler(accessToken);
  return new WebApi(Constants.orgUrl, authHandler);
}
