/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	generateToken,
	generateUser,
	validateTokenClaims,
	validateTokenClaimsExpiration,
} from "./auth";
export {
	convertSortedNumberArrayToRanges,
	dedupeSortedArray,
	mergeKArrays,
	mergeSortedArrays,
} from "./array";
export {
	CorrelationIdHeaderName,
	DriverVersionHeaderName,
	LatestSummaryId,
	TelemetryContextHeaderName,
} from "./constants";
export {
	createFluidServiceNetworkError,
	INetworkErrorDetails,
	InternalErrorCode,
	isNetworkError,
	NetworkError,
	throwFluidServiceNetworkError,
} from "./error";
export { choose, getRandomName } from "./generateNames";
export { GitManager } from "./gitManager";
export { Heap, IHeapComparator } from "./heap";
export {
	getAuthorizationTokenFromCredentials,
	Historian,
	ICredentials,
	parseToken,
} from "./historian";
export { IAlfredTenant, ISession } from "./interfaces";
export { promiseTimeout } from "./promiseTimeout";
export { RestLessClient, RestLessFieldNames } from "./restLessClient";
export { BasicRestWrapper, RestWrapper, IBasicRestWrapperMetricProps } from "./restWrapper";
export { defaultHash, getNextHash } from "./rollingHash";
export {
	canRead,
	canSummarize,
	canWrite,
	canRevokeToken,
	canDeleteDoc,
	TokenRevokeScopeType,
	DocDeleteScopeType,
} from "./scopes";
export {
	getQuorumTreeEntries,
	mergeAppAndProtocolTree,
	generateServiceProtocolEntries,
} from "./scribeHelper";
export {
	ICreateRefParamsExternal,
	IExternalWriterConfig,
	IGetRefParamsExternal,
	IGitCache,
	IGitManager,
	IGitService,
	IHistorian,
	IPatchRefParamsExternal,
	ISummaryUploadManager,
} from "./storage";
export {
	ExtendedSummaryObject,
	IEmbeddedSummaryHandle,
	INormalizedWholeSummary,
	ISummaryTree,
	IWholeFlatSummary,
	IWholeFlatSummaryBlob,
	IWholeFlatSummaryTree,
	IWholeFlatSummaryTreeEntry,
	IWholeFlatSummaryTreeEntryBlob,
	IWholeFlatSummaryTreeEntryTree,
	IWholeSummaryBlob,
	IWholeSummaryPayload,
	IWholeSummaryPayloadType,
	IWholeSummaryTree,
	IWholeSummaryTreeBaseEntry,
	IWholeSummaryTreeHandleEntry,
	IWholeSummaryTreeValueEntry,
	IWriteSummaryResponse,
	WholeSummaryTreeEntry,
	WholeSummaryTreeValue,
} from "./storageContracts";
export {
	buildTreePath,
	convertSummaryTreeToWholeSummaryTree,
	convertWholeFlatSummaryToSnapshotTreeAndBlobs,
	convertFirstSummaryWholeSummaryTreeToSummaryTree,
} from "./storageUtils";
export { SummaryTreeUploadManager } from "./summaryTreeUploadManager";
export {
	ITimeoutContext,
	getGlobalTimeoutContext,
	setGlobalTimeoutContext,
} from "./timeoutContext";
export { getOrCreateRepository, getRandomInt } from "./utils";
export { WholeSummaryUploadManager } from "./wholeSummaryUploadManager";
