/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { decode } from 'msgpack-lite';
import { inflate } from 'pako';
import { Stats as WebpackStats } from 'webpack';

/**
 * To save storage space, we store stats files as gzipped mspack files. This method takes
 * in a compressed file path and outputs the webpack stats object.
 */
export function decompressStatsFile(buffer: Buffer): WebpackStats.ToJsonOutput {
  // Inflate the gzipped data to get the mspack data
  const mspackData = inflate(buffer);

  return decode(mspackData);
}
