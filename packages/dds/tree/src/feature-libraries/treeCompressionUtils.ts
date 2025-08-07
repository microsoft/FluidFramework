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

/**
 * A private extension of {@link TreeCompressionStrategy} for strategies that are not intended for public use just yet.
 */
export enum TreeCompressionStrategyExtended {
	/**
	 * Optimized for encoded size, same as TreeCompressionStrategy.Compressed. It also enables incremental encoding
	 * of the data.
	 * @remarks
	 * TODO:
	 * This needs to be stabilized to allow opting into it.
	 * It could possibly be made the default instead of {@link TreeCompressionStrategy.Compressed}.
	 */
	CompressedIncremental = 2,
}

export type TreeCompressionStrategyPrivate =
	| TreeCompressionStrategy
	| TreeCompressionStrategyExtended;
