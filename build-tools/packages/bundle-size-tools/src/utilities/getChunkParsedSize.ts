/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { StatsCompilation } from "webpack";

/**
 * This gets the size of a chunk after minification, which is what the browser will parse.
 */
export function getChunkParsedSize(stats: StatsCompilation, chunkId: string | number): number {
	if (stats.assets === undefined) {
		throw new Error(
			`No assets property in the stats file, can't compute parsed sizes of chunks`,
		);
	}

	const matchingAsset = stats.assets.find((asset) => {
		// Make sure to only look at js files and not source maps (assumes source maps don't end in .js)
		if (asset.name.endsWith(".js")) {
			// Assumes only a single chunk per asset, this may not hold for all apps.
			return asset.chunks?.includes(chunkId);
		}

		return false;
	});

	// If there's no matching asset it could be that it was removed in the new version of the bundle, not necessarily an
	// error. In that case return 0 as its size.
	return matchingAsset?.size ?? 0;
}
