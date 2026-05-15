/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as fsPromises } from "fs";
import { join } from "path";
import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import { sourcePackageFromAnalyzerPath } from "./sourcePackageFromAnalyzerPath.js";
import type { AnalyzerJsonByPackage } from "./types.js";

/**
 * Recursively walk `sourceFolder`, returning the relative path of every file.
 */
async function getAllFilesInDirectory(
	sourceFolder: string,
	partialPathPrefix: string = "",
): Promise<string[]> {
	const result: string[] = [];
	for (const file of await fsPromises.readdir(sourceFolder)) {
		const fullPath = join(sourceFolder, file);
		if ((await fsPromises.stat(fullPath)).isFile()) {
			result.push(join(partialPathPrefix, file));
		} else {
			result.push(
				...(await getAllFilesInDirectory(
					join(sourceFolder, file),
					join(partialPathPrefix, file),
				)),
			);
		}
	}
	return result;
}

/**
 * Walks `rootPath`, finds every `analyzer.json` file, parses it, and keys the
 * results by source package.
 */
export async function readAnalyzerJsonsFromFileSystem(
	rootPath: string,
): Promise<AnalyzerJsonByPackage> {
	const allPaths = await getAllFilesInDirectory(rootPath);
	const result: AnalyzerJsonByPackage = new Map();
	const reads: Promise<void>[] = [];
	for (const relativePath of allPaths) {
		const sourcePackage = sourcePackageFromAnalyzerPath(relativePath);
		if (sourcePackage === undefined) continue;
		reads.push(
			fsPromises.readFile(join(rootPath, relativePath), "utf8").then((text) => {
				result.set(sourcePackage, JSON.parse(text) as BundleAnalyzerPlugin.JsonReport);
			}),
		);
	}
	await Promise.all(reads);
	return result;
}
