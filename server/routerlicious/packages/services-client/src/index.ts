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
export { convertSortedNumberArrayToRanges } from "./array";
export { CorrelationIdHeaderName, DriverVersionHeaderName, LatestSummaryId } from "./constants";
export {
	createFluidServiceNetworkError,
	INetworkErrorDetails,
	isNetworkError,
	NetworkError,
	throwFluidServiceNetworkError,
} from "./error";
export { choose, getRandomName } from "./generateNames";
export { GitManager } from "./gitManager";
export { getAuthorizationTokenFromCredentials, Historian, ICredentials } from "./historian";
export { IAlfredTenant, ISession } from "./interfaces";
export { promiseTimeout } from "./promiseTimeout";
export { RestLessClient, RestLessFieldNames } from "./restLessClient";
export { BasicRestWrapper, RestWrapper } from "./restWrapper";
export { defaultHash, getNextHash } from "./rollingHash";
export { canRead, canSummarize, canWrite, canRevokeToken } from "./scopes";
export {
	ICreateRefParamsExternal,
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
} from "./storageUtils";
export { SummaryTreeUploadManager } from "./summaryTreeUploadManager";
export { getOrCreateRepository, getRandomInt } from "./utils";
export { WholeSummaryUploadManager } from "./wholeSummaryUploadManager";
