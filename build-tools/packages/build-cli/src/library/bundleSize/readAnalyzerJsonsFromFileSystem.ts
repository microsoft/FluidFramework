/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import { sourcePackageFromAnalyzerPath } from "./sourcePackageFromAnalyzerPath.js";
import type { AnalyzerJsonByPackage } from "./types.js";

const analyzerJsonGlob = "**/analyzer.json";

/**
 * Check whether `rootPath` exists and contains any `analyzer.json` file.
 *
 * @returns `"ok"`, `"missing"` (rootPath doesn't exist), or `"noAnalyzerJson"`
 * (rootPath exists but the tree has none). Real failures (permission errors,
 * broken symlinks, …) propagate as-is rather than collapsing to a kind.
 */
export function checkLocalBundleAnalysisExists(
	rootPath: string,
): "ok" | "missing" | "noAnalyzerJson" {
	if (statSync(rootPath, { throwIfNoEntry: false }) === undefined) {
		return "missing";
	}
	return globSync(analyzerJsonGlob, { cwd: rootPath }).length > 0 ? "ok" : "noAnalyzerJson";
}

/**
 * Walks `rootPath`, finds every `analyzer.json` file, parses it, and keys the
 * results by source package.
 */
export async function readAnalyzerJsonsFromFileSystem(
	rootPath: string,
): Promise<AnalyzerJsonByPackage> {
	const result: AnalyzerJsonByPackage = new Map();
	await Promise.all(
		globSync(analyzerJsonGlob, { cwd: rootPath }).map(async (relativePath) => {
			const sourcePackage = sourcePackageFromAnalyzerPath(relativePath);
			if (sourcePackage === undefined) return;
			const text = await readFile(join(rootPath, relativePath), "utf8");
			result.set(sourcePackage, JSON.parse(text) as BundleAnalyzerPlugin.JsonReport);
		}),
	);
	return result;
}
