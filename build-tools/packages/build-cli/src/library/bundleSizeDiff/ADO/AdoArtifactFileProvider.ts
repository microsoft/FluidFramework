/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import type { ArtifactContents } from "../../azureDevops/downloadArtifact.js";

/**
 * Retrieves and parses an analyzer.json file (webpack-bundle-analyzer's
 * `analyzerMode: "json"` output) from the decompressed artifact contents.
 * @param contents - Artifact contents keyed by file path relative to the artifact root.
 * @param relativePath - The relative path to the file that will be retrieved.
 */
export function getAnalyzerJsonFromContents(
	contents: ArtifactContents,
	relativePath: string,
): BundleAnalyzerPlugin.JsonReport {
	const bytes = contents[relativePath];
	assert(bytes, `getAnalyzerJsonFromContents could not find file ${relativePath}`);

	const text = Buffer.from(bytes).toString("utf8");
	return JSON.parse(text) as BundleAnalyzerPlugin.JsonReport;
}
