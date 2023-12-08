/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @alpha
 */
export enum SummaryCompressionAlgorithm {
	None = 0,
	LZ4 = 1,
}

/**
 * @alpha
 */
export interface ICompressionStorageConfig {
	algorithm: SummaryCompressionAlgorithm;
	minSizeToCompress: number;
}

export const DefaultCompressionStorageConfig = {
	algorithm: SummaryCompressionAlgorithm.LZ4,
	minSizeToCompress: 500,
};
