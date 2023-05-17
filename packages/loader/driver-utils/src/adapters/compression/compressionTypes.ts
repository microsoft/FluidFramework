/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export enum SummaryCompressionAlgorithm {
	None = 1,
	LZ4 = 2,
}
export enum SummaryCompressionProcessor {
	SummaryBlob = 1,
	SummaryKey = 2,
}

export interface ICompressionStorageConfig {
	algorithm: SummaryCompressionAlgorithm;
	minSizeToCompress: number;
	processor: SummaryCompressionProcessor;
}
