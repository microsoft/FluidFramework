/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	SummaryCompressionAlgorithm,
	ICompressionStorageConfig,
	DefaultCompressionStorageConfig,
	blobHeadersBlobName,
} from "./compression/index.js";

export { applyStorageCompression } from "./predefinedAdapters.js";
