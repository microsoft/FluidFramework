/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	applyStorageCompression,
	blobHeadersBlobName,
	type ICompressionStorageConfig,
	SummaryCompressionAlgorithm,
} from "./adapters/index.js";
export { AttachmentTreeEntry, BlobTreeEntry, TreeTreeEntry } from "./blob.js";
export { buildSnapshotTree } from "./buildSnapshotTree.js";
export { getKeyForCacheEntry, maximumCacheDurationMs } from "./cacheUtils.js";
export { DocumentStorageServiceProxy } from "./documentStorageServiceProxy.js";
export { UsageError } from "./error.js";
export { InsecureUrlResolver } from "./insecureUrlResolver.js";
export {
	canBeCoalescedByService,
	isRuntimeMessage,
} from "./messageRecognition.js";
export {
	AuthorizationError,
	canRetryOnError,
	createGenericNetworkError,
	createWriteError,
	DeltaStreamConnectionForbiddenError,
	type DriverErrorTelemetryProps,
	FluidInvalidSchemaError,
	GenericNetworkError,
	getRetryDelayFromError,
	getRetryDelaySecondsFromError,
	isOnline,
	LocationRedirectionError,
	NetworkErrorBasic,
	NonRetryableError,
	OnlineStatus,
	RetryableError,
	ThrottlingError,
} from "./network.js";
export { logNetworkFailure } from "./networkUtils.js";
export {
	emptyMessageStream,
	ParallelRequests,
	Queue,
	requestOps,
	streamFromMessages,
	streamObserver,
} from "./parallelRequests.js";
export { PrefetchDocumentStorageService } from "./prefetchDocumentStorageService.js";
export { buildGitTreeHierarchy, getGitMode, getGitType } from "./protocol/index.js";
export { RateLimiter } from "./rateLimiter.js";
export { readAndParse } from "./readAndParse.js";
export { calculateMaxWaitTime, type IProgress, runWithRetry } from "./runWithRetry.js";
export { getSnapshotTree, isInstanceOfISnapshot } from "./storageUtils.js";
export {
	type CombinedAppAndProtocolSummary,
	getDocAttributesFromProtocolSummary,
	getQuorumValuesFromProtocolSummary,
	isCombinedAppAndProtocolSummary,
} from "./summaryForCreateNew.js";
export { convertSummaryTreeToSnapshotITree } from "./treeConversions.js";
