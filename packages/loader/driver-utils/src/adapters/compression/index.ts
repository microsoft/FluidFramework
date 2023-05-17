/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	SummaryCompressionAlgorithm,
	ICompressionStorageConfig,
	SummaryCompressionProcessor,
} from "./compressionTypes";
export { DocumentServiceFactoryCompressionAdapter as DocumentServiceFactorySummaryKeyCompressionAdapter } from "./summarykey";
export { DocumentServiceFactoryCompressionAdapter as DocumentServiceFactorySummaryBlobCompressionAdapter } from "./summaryblob";
