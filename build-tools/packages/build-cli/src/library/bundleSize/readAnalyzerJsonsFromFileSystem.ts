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
 * Result of {@link readAnalyzerJsonsFromFileSystem}. `"error"` signals
 * `rootPath` can't be walked (doesn't exist, isn't a directory, …); `"ok"`
 * means the walk succeeded and `data` holds the per-package parsed reports.
 */
export type ReadAnalyzerJsonsResult =
	| { kind: "ok"; data: AnalyzerJsonByPackage }
	| { kind: "error" };

/**
 * Walks `rootPath`, finds every `<package>/analyzer.json` file, parses it, and
 * keys the results by source package.
 *
 * @remarks The result Map may be empty — either because the tree has no
 * `analyzer.json` files at all, or because every match was at an unexpected
 * depth (e.g. a bare `analyzer.json` with no package prefix). Callers decide
 * whether emptiness is an error in their context.
 */
export async function readAnalyzerJsonsFromFileSystem(
	rootPath: string,
): Promise<ReadAnalyzerJsonsResult> {
	const stat = statSync(rootPath, { throwIfNoEntry: false });
	if (stat === undefined || !stat.isDirectory()) {
		return { kind: "error" };
	}
	const data: AnalyzerJsonByPackage = new Map();
	await Promise.all(
		globSync(analyzerJsonGlob, { cwd: rootPath }).map(async (relativePath) => {
			const sourcePackage = sourcePackageFromAnalyzerPath(relativePath);
			if (sourcePackage === undefined) return;
			const fullPath = join(rootPath, relativePath);
			const text = await readFile(fullPath, "utf8");
			let parsed: BundleAnalyzerPlugin.JsonReport;
			try {
				parsed = JSON.parse(text) as BundleAnalyzerPlugin.JsonReport;
			} catch (e) {
				throw new Error(`Failed to parse analyzer.json at "${fullPath}"`, { cause: e });
			}
			data.set(sourcePackage, parsed);
		}),
	);
	return { kind: "ok", data };
}
