/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * ADO `Build - Client bundle size artifacts` pipeline (public project) —
 * publishes the baseline-side `bundleAnalyzerJson` artifact for PR
 * bundle-size comparisons.
 * Source-of-truth: `tools/pipelines/build-bundle-size-artifacts.yml`.
 */
export const bundleSizeArtifactsBaselinePipeline = {
	project: "public",
	definitionId: 48,
	bundleAnalyzerJsonArtifactName: "bundleAnalyzerJson",
} as const;

/**
 * ADO `Build - client packages` pipeline (public project) — publishes the
 * PR-head-side `bundleAnalyzerJson` artifact for PR bundle-size comparisons.
 * Source-of-truth: `tools/pipelines/build-client.yml`.
 */
export const bundleSizeArtifactsPrPipeline = {
	project: "public",
	definitionId: 11,
	bundleAnalyzerJsonArtifactName: "bundleAnalyzerJson",
} as const;

/** ADO organization URL hosting the pipelines. */
export const fluidframeworkAdoOrgUrl = "https://dev.azure.com/fluidframework";
