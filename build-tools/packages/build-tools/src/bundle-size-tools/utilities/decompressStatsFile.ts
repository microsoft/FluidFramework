/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { gunzipSync } from "fflate";
import { decode } from "msgpack-lite";
import type { StatsCompilation } from "webpack";

/**
 * To save storage space, we store stats files as gzipped mspack files. This method takes
 * in a compressed file path and outputs the webpack stats object.
 */
export function decompressStatsFile(buffer: Buffer): StatsCompilation {
	// Decompress the gzipped data to get the msgpack data
	const mspackData = gunzipSync(buffer);

	return decode(mspackData);
}
