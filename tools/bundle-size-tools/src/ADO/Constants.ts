/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const Constants = {
  // URL for the ADO org
  orgUrl: '',

  // The ADO project that contains the repo
  projectName: '',

  // The ID for the build that runs against master when PRs are merged
  ciBuildDefinitionId: 0,

  // The ID for the build that runs to validate PRs
  prBuildDefinitionId: 0,

  // The name of the build artifact that contains the bundle size artifacts
  bundleAnalysisArtifactName: '',

  // The guid of the repo
  projectRepoGuid: '',

  // The name of the metric that represents the size of the whole bundle
  totalSizeMetricName: ''
};
