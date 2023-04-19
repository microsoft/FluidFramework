/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { SummaryCompressionAlgorithm } from "./compression";



export function applyStorageCompression(
	documentServiceFactory: IDocumentServiceFactory,
	config: ICompressionStorageConfig = { algorithm: SummaryCompressionAlgorithm.LZ4, minSizeToCompress: 500 },
): IDocumentServiceFactory {
	if (config.algorithm === undefined) {
		return documentServiceFactory;
	}
	return documentServiceFactory;
}

export interface ICompressionStorageConfig {
	algorithm: SummaryCompressionAlgorithm;
	minSizeToCompress: number;
}

