/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { generateHandleContextPath } from "./dataStoreHandleContextUtils.js";
export {
	create404Response,
	createResponseError,
	exceptionToResponse,
	responseToException,
	asLegacyAlpha,
} from "./dataStoreHelpers.js";
export {
	compareFluidHandles,
	encodeHandleForSerialization,
	FluidHandleBase,
	isFluidHandle,
	isFluidHandleInternalPayloadPending,
	isFluidHandlePayloadPending,
	isLocalFluidHandle,
	isSerializedHandle,
	lookupTemporaryBlobStorageId,
	toFluidHandleErased,
	toFluidHandleInternal,
} from "./handles.js";
export type { ISerializedHandle } from "./handles.js";
export { ObjectStoragePartition } from "./objectstoragepartition.js";
export {
	getNormalizedObjectStoragePathParts,
	listBlobsAtTreePath,
} from "./objectstorageutils.js";
export { RemoteFluidObjectHandle } from "./remoteFluidObjectHandle.js";
export { RequestParser } from "./requestParser.js";
export { RuntimeFactoryHelper } from "./runtimeFactoryHelper.js";
export {
	addBlobToSummary,
	addSummarizeResultToSummary,
	calculateStats,
	convertSnapshotTreeToSummaryTree,
	convertSummaryTreeToITree,
	convertToSummaryTree,
	convertToSummaryTreeWithStats,
	GCDataBuilder,
	getBlobSize,
	mergeStats,
	processAttachMessageGCData,
	SummaryTreeBuilder,
	TelemetryContext,
	utf8ByteLength,
} from "./summaryUtils.js";
export { unpackChildNodesUsedRoutes } from "./unpackUsedRoutes.js";
export {
	RuntimeHeaders,
	seqFromTree,
	encodeCompactIdToString,
} from "./utils.js";
export type { ReadAndParseBlob } from "./utils.js";
export { isSnapshotFetchRequiredForLoadingGroupId } from "./snapshotUtils.js";
export {
	toDeltaManagerErased,
	toDeltaManagerInternal,
} from "./deltaManager.js";
export {
	configValueToMinVersionForCollab,
	defaultMinVersionForCollab,
	validateConfigMapOverrides,
	getConfigForMinVersionForCollab,
	getConfigsForMinVersionForCollab,
	isValidMinVersionForCollab,
	validateMinimumVersionForCollab,
	lowestMinVersionForCollab,
	cleanedPackageVersion,
} from "./compatibilityBase.js";
export type {
	ConfigMap,
	ConfigMapEntry,
	ConfigValidationMap,
	MinimumMinorSemanticVersion,
	SemanticVersion,
} from "./compatibilityBase.js";
