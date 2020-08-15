/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { WebApi } from 'azure-devops-node-api';
import { getBuilds } from './getBuilds';

export interface GetCiBuildWithCommitArgs {
  adoConnection: WebApi;

  adoProjectName: string;

  buildDefinitionId: number;

  commitHash: string;
}

/**
 * Returns the ADO CI build with a given git commit hash
 */
export async function getCiBuildWithCommit({
  adoConnection,
  adoProjectName,
  buildDefinitionId,
  commitHash
}: GetCiBuildWithCommitArgs) {
  const builds = await getBuilds(adoConnection, {
    project: adoProjectName,
    definitions: [buildDefinitionId],
    maxBuildsPerDefinition: 20 /* Set to improve query performance*/
  });

  return builds.find((build) => build.sourceVersion === commitHash);
}
