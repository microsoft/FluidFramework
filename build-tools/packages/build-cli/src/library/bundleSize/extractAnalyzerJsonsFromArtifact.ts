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
 * it, and keys the results by source package. Non-matching paths are skipped —
 * the artifact contract isn't pipeline-enforced. Callers should validate the
 * resulting map is non-empty.
 */
export function extractAnalyzerJsonsFromArtifact(
	contents: ArtifactContents,
): AnalyzerJsonByPackage {
	const result: AnalyzerJsonByPackage = new Map();
	for (const [relativePath, bytes] of Object.entries(contents)) {
		const sourcePackage = sourcePackageFromAnalyzerPath(relativePath);
		if (sourcePackage === undefined) continue;
		const text = Buffer.from(bytes).toString("utf8");
		let parsed: BundleAnalyzerPlugin.JsonReport;
		try {
			parsed = JSON.parse(text) as BundleAnalyzerPlugin.JsonReport;
		} catch (e) {
			throw new Error(`Failed to parse analyzer.json at "${relativePath}" in artifact`, {
				cause: e,
			});
		}
		result.set(sourcePackage, parsed);
	}
	return result;
}
