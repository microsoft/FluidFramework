/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as fsPromises } from "fs";
import type { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import { getAllFilesInDirectory } from "../utilities";
import {
	type BundleFileData,
	getAnalyzerFilePathsFromFolder,
} from "./getBundleFilePathsFromFolder";

/**
 * Returns a list of `analyzer.json` paths from the given folder (one per source package).
 * @param bundleReportPath - The path to the folder containing the bundle report
 */
export async function getAnalyzerPathsFromFileSystem(
	bundleReportPath: string,
): Promise<BundleFileData[]> {
	const filePaths = await getAllFilesInDirectory(bundleReportPath);

	return getAnalyzerFilePathsFromFolder(filePaths);
}

/**
 * Reads and parses an analyzer.json file (webpack-bundle-analyzer's
 * `analyzerMode: "json"` output) from the filesystem.
 * @param path - the full path to the file in the filesystem
 */
export async function getAnalyzerJsonFromFileSystem(
	path: string,
): Promise<BundleAnalyzerPlugin.JsonReport> {
	const text = await fsPromises.readFile(path, "utf8");

	return JSON.parse(text) as BundleAnalyzerPlugin.JsonReport;
}
