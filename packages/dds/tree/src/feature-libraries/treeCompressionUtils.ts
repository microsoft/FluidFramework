/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Selects which heuristics to use when encoding tree content.
 * All encoding options here are compatible with the same decoder:
 * the selection here does not impact compatibility.
 * @alpha
 */
export enum TreeCompressionStrategy {
	/**
	 * Optimized for encoded size.
	 * Use this in production to reduce bandwidth and storage use.
	 */
	Compressed = 0,
	/**
	 * Optimized for human readability.
	 * Use this when debugging or testing and needing to inspect encoded tree content.
	 */
	Uncompressed = 1,
}
