/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "..";
import { CompressionSummaryStorageAdapter, SummaryCompressionAlgorithm } from "./compression";

function applyStorageCompression(
	storage: IDocumentStorageService,
	algorithm: SummaryCompressionAlgorithm | undefined = SummaryCompressionAlgorithm.LZ4,
	minSizeToCompress: number | undefined = 500,
): IDocumentStorageService {
	if (algorithm === undefined) {
		return storage;
	}
	return new CompressionSummaryStorageAdapter(storage, algorithm, minSizeToCompress, true);
}

export interface ICompressionStorageConfig {
	algorithm: SummaryCompressionAlgorithm;
	minSizeToCompress: number;
}

export type StorageAdapterBuilderType = (
	storage: IDocumentStorageService,
) => IDocumentStorageService;

export function createDefaultCompressionConfig(): ICompressionStorageConfig {
	return {
		algorithm: SummaryCompressionAlgorithm.LZ4,
		minSizeToCompress: 500,
	};
}

export function createCompressionStorageAdapterBuilder(
	config: ICompressionStorageConfig = createDefaultCompressionConfig(),
): StorageAdapterBuilderType {
	return (storage: IDocumentStorageService): IDocumentStorageService => {
		return applyStorageCompression(storage, config.algorithm, config.minSizeToCompress);
	};
}

/**
 * This function obtains an array of storage adapter builders that are used to wrap the storage service.
 * It also obtain the IDocumentStorageService objects and it wraps it with the adapters.
 */
export function applyStorageAdapters(
	storage: IDocumentStorageService,
	storageAdapters: StorageAdapterBuilderType[] = [],
): IDocumentStorageService {
	let storageService = storage;
	for (const adapter of storageAdapters) {
		storageService = adapter(storageService);
	}
	return storageService;
}

