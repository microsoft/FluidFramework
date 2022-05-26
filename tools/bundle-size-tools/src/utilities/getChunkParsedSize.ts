/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StatsCompilation } from 'webpack';

/**
 * This gets the size of a chunk after minification, which is what the browser will parse.
 */
export function getChunkParsedSize(stats: StatsCompilation, chunkId: string | number): number {
  if (stats.assets === undefined) {
    throw new Error(`No assets property in the stats file, can't compute parsed sizes of chunks`);
  }

  const matchingAsset = stats.assets.find((asset) => {
    // Make sure to only look at js files and not source maps (assumes source maps don't end in .js)
    if (asset.name.endsWith('.js')) {
      // Assumes only a single chunk per asset, this may not hold for all apps.
      return asset.chunks?.[0] === chunkId;
    }

    return false;
  });

  if (matchingAsset === undefined) {
    throw new Error(`Could not find asset for chunk with id '${chunkId}' in the webpack stats`);
  }

  return matchingAsset.size;
}
