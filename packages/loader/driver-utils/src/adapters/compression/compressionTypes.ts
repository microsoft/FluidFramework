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
}

export interface ICompressionStorageConfig {
	algorithm: SummaryCompressionAlgorithm;
	minSizeToCompress: number;
	processor: SummaryCompressionProcessor;
}

export const DefaultCompressionStorageConfig = {
	algorithm: SummaryCompressionAlgorithm.LZ4,
	minSizeToCompress: 500,
	processor: SummaryCompressionProcessor.SummaryBlob,
};

export const defaultIsUseB64OnCompressed = true;
