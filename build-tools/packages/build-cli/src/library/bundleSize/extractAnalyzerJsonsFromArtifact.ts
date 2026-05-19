/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import type { ArtifactContents } from "../azureDevops/downloadArtifact.js";
import { sourcePackageFromAnalyzerPath } from "./sourcePackageFromAnalyzerPath.js";
import type { AnalyzerJsonByPackage } from "./types.js";

/**
 * Walks a downloaded artifact's contents, finds every `analyzer.json`, parses
 * it, and keys the results by source package.
 */
export function extractAnalyzerJsonsFromArtifact(
	contents: ArtifactContents,
): AnalyzerJsonByPackage {
	const result: AnalyzerJsonByPackage = new Map();
	for (const [relativePath, bytes] of Object.entries(contents)) {
		const sourcePackage = sourcePackageFromAnalyzerPath(relativePath);
		if (sourcePackage === undefined) continue;
		const text = Buffer.from(bytes).toString("utf8");
		result.set(sourcePackage, JSON.parse(text) as BundleAnalyzerPlugin.JsonReport);
	}
	return result;
}
