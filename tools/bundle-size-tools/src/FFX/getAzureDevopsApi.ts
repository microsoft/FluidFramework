/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getPersonalAccessTokenHandler, WebApi } from 'azure-devops-node-api';
import { FFXConstants } from './FFXConstants';

export function getAzureDevopsApi(accessToken: string) {
  const authHandler = getPersonalAccessTokenHandler(accessToken);
  return new WebApi(FFXConstants.orgUrl, authHandler);
}
