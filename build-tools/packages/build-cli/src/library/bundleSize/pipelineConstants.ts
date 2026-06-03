/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Identifiers for the ADO `Build - Client bundle size artifacts` pipeline.
 * Source-of-truth: `tools/pipelines/build-bundle-size-artifacts.yml`.
 */
export const bundleSizeArtifactsPipeline = {
	project: "public",
	definitionId: 48,
	bundleAnalyzerJsonArtifactName: "bundleAnalyzerJson",
} as const;

/**
 * ADO organization URL hosting the pipeline.
 */
export const fluidframeworkAdoOrgUrl = "https://dev.azure.com/fluidframework";
