/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import {
	DocumentServiceFactoryCompressionAdapter,
	ICompressionStorageConfig,
	DefaultCompressionStorageConfig,
} from "./compression/index.js";

/**
 * This method optionally applies compression to the given document service factory. The compression
 * must be enabled by setting the config to true or by passing a compression config object.
 * @param documentServiceFactory - The document service factory to apply compression to.
 * @param config - The compression configuration.
 * @returns The document service factory possibly with compression applied.
 * @internal
 */
export function applyStorageCompression(
	documentServiceFactory: IDocumentServiceFactory,
	config?: ICompressionStorageConfig | boolean,
): IDocumentServiceFactory {
	if (config === undefined || config === false) {
		return documentServiceFactory;
	} else if (config === true) {
		return applyStorageCompressionInternal(
			DocumentServiceFactoryCompressionAdapter,
			documentServiceFactory,
		);
	} else {
		assert(isCompressionConfig(config), 0x6f4 /* Invalid compression config */);
		return applyStorageCompressionInternal(
			DocumentServiceFactoryCompressionAdapter,
			documentServiceFactory,
			config,
		);
	}
}

/**
 * This method applies compression to the given document service factory.
 * @param documentServiceFactory - The document service factory to apply compression to.
 * @param config - The compression configuration.
 * @returns The document service factory with compression applied.
 */
function applyStorageCompressionInternal(
	constructor: new (
		// eslint-disable-next-line @typescript-eslint/no-shadow
		documentServiceFactory: IDocumentServiceFactory,
		// eslint-disable-next-line @typescript-eslint/no-shadow
		config: ICompressionStorageConfig,
	) => IDocumentServiceFactory,
	documentServiceFactory: IDocumentServiceFactory,
	config: ICompressionStorageConfig = DefaultCompressionStorageConfig,
): IDocumentServiceFactory {
	if (config.algorithm === undefined) {
		return documentServiceFactory;
	}
	return new constructor(documentServiceFactory, config);
}

/**
 * This method checks whether given objects contains
 * a properties expected for the interface ICompressionStorageConfig.
 */
export function isCompressionConfig(config: any): config is ICompressionStorageConfig {
	return (
		config !== undefined &&
		(config.algorithm !== undefined || config.minSizeToCompress !== undefined)
	);
}
