/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { SummaryCompressionAlgorithm } from "./compression";

export {
	createCompressionStorageAdapterBuilder,
	ICompressionStorageConfig,
	createDefaultCompressionConfig,
	applyStorageAdapters,
	StorageAdapterBuilderType,
} from "./predefinedAdapters";
