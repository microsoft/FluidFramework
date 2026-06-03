/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Identifiers for the ADO `Build - Client bundle size artifacts` pipeline. Runs on pushes to main /
 * release branches in the public ADO project and publishes the `bundleAnalyzerJson` artifact for the
 * baseline side of PR bundle-size comparisons.
 *
 * Source-of-truth: `tools/pipelines/build-bundle-size-artifacts.yml`.
 */
export const bundleSizeArtifactsBaselinePipeline = {
	project: "public",
	definitionId: 48,
	bundleAnalyzerJsonArtifactName: "bundleAnalyzerJson",
} as const;

/**
 * Identifiers for the ADO `Build - client packages` pipeline (public project variant). Runs on every
 * PR commit (building the GitHub-generated merge SHA) and publishes the `bundleAnalyzerJson` artifact
 * for the PR-head side of PR bundle-size comparisons. The actual PR HEAD SHA appears as
 * `triggerInfo['pr.sourceSha']`; `sourceVersion` is the GitHub-generated test-merge SHA.
 *
 * Source-of-truth: `tools/pipelines/build-client.yml`.
 */
export const bundleSizeArtifactsPrPipeline = {
	project: "public",
	definitionId: 11,
	bundleAnalyzerJsonArtifactName: "bundleAnalyzerJson",
} as const;

/**
 * ADO organization URL hosting the pipelines.
 */
export const fluidframeworkAdoOrgUrl = "https://dev.azure.com/fluidframework";
