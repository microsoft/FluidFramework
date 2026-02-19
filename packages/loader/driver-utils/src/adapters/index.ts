/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	DefaultCompressionStorageConfig,
	type ICompressionStorageConfig,
	SummaryCompressionAlgorithm,
	blobHeadersBlobName,
} from "./compression/index.js";
export { applyStorageCompression } from "./predefinedAdapters.js";
