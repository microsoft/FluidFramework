/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import {
	SummaryCompressionAlgorithm,
	DocumentServiceFactoryCompressionAdapter,
	ICompressionStorageConfig,
} from "./compression";

export function applyStorageCompression(
	documentServiceFactory: IDocumentServiceFactory,
	config?: ICompressionStorageConfig | boolean,
): IDocumentServiceFactory {
	if (config === undefined || config === false) {
		return documentServiceFactory;
	} else if (config === true) {
		return applyStorageCompressionInternal(documentServiceFactory);
	} else {
		return applyStorageCompressionInternal(documentServiceFactory, config);
	}
}

function applyStorageCompressionInternal(
	documentServiceFactory: IDocumentServiceFactory,
	config: ICompressionStorageConfig = {
		algorithm: SummaryCompressionAlgorithm.LZ4,
		minSizeToCompress: 500,
	},
): IDocumentServiceFactory {
	if (config.algorithm === undefined) {
		return documentServiceFactory;
	}
	return new DocumentServiceFactoryCompressionAdapter(documentServiceFactory, config);
}
