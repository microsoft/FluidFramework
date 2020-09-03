/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IADOConstants {
  // URL for the ADO org
  orgUrl: string,

  // The ADO project that contains the repo
  projectName: string,

  // The ID for the build that runs against main when PRs are merged
  ciBuildDefinitionId: number,

  // The ID for the build that runs to validate PRs
  // Used to update tagged PRs on CI build completion
  // Note: Assumes CI and PR builds both run in the same org/project
  prBuildDefinitionId: number | undefined,

  // The name of the build artifact that contains the bundle size artifacts
  bundleAnalysisArtifactName: string,

  // The guid of the repo
  // Used to post/update comments in ADO
  projectRepoGuid: string | undefined,

  // The number of most recent ADO builds to pull when searching for one associated
  // with a specific commit, default 20.  Pulling more builds takes longer, but may
  // be useful when there are a high volume of commits/builds.
  buildsToSearch: number | undefined,
}

// The name of the metric that represents the size of the whole bundle
export const totalSizeMetricName = 'Total Size';
