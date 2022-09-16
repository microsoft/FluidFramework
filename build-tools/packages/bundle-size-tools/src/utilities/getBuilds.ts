/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { WebApi } from 'azure-devops-node-api';

export interface GetBuildOptions {
  // The ADO project name
  project: string;

  // An array of ADO definitions that should be considered for this query
  definitions: number[];

  // An optional set of tags that should be on the returned builds
  tagFilters?: string[];

  // An upper limit on the number of queries to return. Can be used to improve performance
  maxBuildsPerDefinition?: number;
}

/**
 * A wrapper around the terrible API signature for ADO getBuilds
 */
export async function getBuilds(adoConnection: WebApi, options: GetBuildOptions) {
  const buildApi = await adoConnection.getBuildApi();

  return buildApi.getBuilds(
    options.project,
    options.definitions,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.tagFilters,
    undefined,
    undefined,
    undefined,
    options.maxBuildsPerDefinition
  );
}
