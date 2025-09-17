/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { StatsCompilation } from "webpack";

/**
 * This gets the size of a chunk after minification, which is what the browser will parse.
 */
export function getChunkParsedSize(stats: StatsCompilation, chunkId: string | number): number {
	if (stats.assets === undefined) {
		throw new Error(
			`No assets property in the stats file, can't compute parsed sizes of chunks`,
		);
	}

	//Find all the assets that contain the chunk. Note: an asset may contain more than one chunk.
	const matchingAssets = stats.assets.filter((asset) => {
		// Make sure to only look at js files and not source maps (assumes source maps don't end in .js)
		if (asset.name.endsWith(".js")) {
			// If the asset contains the chunk, it should be considered when calculating the total size.
			return asset.chunks?.includes(chunkId);
		}

		return false;
	});

	if (matchingAssets.length === 0) {
		throw new Error(
			`Could not find an asset for chunk with id '${chunkId}' in the webpack stats`,
		);
	}

	if (matchingAssets.length > 1) {
		// Typically we expect a single asset to be found per chunk (this is maybe not typical of all webpack projects, but
		// it seems to be the case in our usage here), so if we find more than one, log a warning so we can investigate more
		// easily if needed.
		console.warn(
			`${matchingAssets.length} assets contain chunk with id '${chunkId}'; will return total size of all matching assets.`,
		);
	}

	// The total size is the sum of the sizes of all assets with the chunk.
	const totalSize = matchingAssets.reduce((acc, asset) => acc + asset.size, 0);
	return totalSize;
}
