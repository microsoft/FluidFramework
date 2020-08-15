export const FFXConstants = {
  // URL for the ADO org
  orgUrl: 'https://dev.azure.com/office',

  // The ADO project that contains the office-bohemia-repo
  projectName: 'oc',

  // The ID for the build that runs against master when PRs are merged
  ciBuildDefinitionId: 8228,

  // The ID for the build that runs to validate PRs
  prBuildDefinitionId: 8024,

  // The name of the build artifact that contains the bundle size artifacts
  bundleAnalysisArtifactName: 'bundle-analysis-reports',

  // The guid of the office-bohemia repo
  projectRepoGuid: '74031860-e0cd-45a1-913f-10bbf3f82555',

  // The name of the metric that represents the size of the whole bundle
  totalSizeMetricName: 'Total Size'
};
