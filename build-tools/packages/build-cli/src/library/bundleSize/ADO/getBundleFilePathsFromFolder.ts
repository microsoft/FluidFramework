/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { sourcePackageFromAnalyzerPath } from "../sourcePackageFromAnalyzerPath.js";

export interface BundleFileData {
	bundleName: string;

	relativePathToStatsFile: string;

	relativePathToConfigFile: string | undefined;
}

/**
 * Filters the given paths down to `analyzer.json` files (one per source package),
 * pairing each with its source-package name.
 */
export function getAnalyzerFilePathsFromFolder(
	relativePathsInFolder: string[],
): BundleFileData[] {
	const results: BundleFileData[] = [];
	for (const relativePath of relativePathsInFolder) {
		const bundleName = sourcePackageFromAnalyzerPath(relativePath);
		if (bundleName === undefined) continue;
		results.push({
			bundleName,
			relativePathToStatsFile: relativePath,
			relativePathToConfigFile: undefined,
		});
	}
	return results;
}
