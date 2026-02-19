/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type BatchId,
	BatchManager,
	type BatchSequenceNumbers,
	type IBatchManagerOptions,
	addBatchMetadata,
	generateBatchId,
	getEffectiveBatchId,
} from "./batchManager.js";
export type {
	IBatchCheckpoint,
	IChunkedOp,
	LocalBatch,
	LocalBatchMessage,
	LocalEmptyBatchPlaceholder,
	OutboundBatch,
	OutboundBatchMessage,
	OutboundSingletonBatch,
} from "./definitions.js";
export { DuplicateBatchDetector } from "./duplicateBatchDetector.js";
export { OpCompressor } from "./opCompressor.js";
export { OpDecompressor } from "./opDecompressor.js";
export {
	type EmptyGroupedBatch,
	OpGroupingManager,
	type OpGroupingManagerConfig,
	isGroupedBatch,
} from "./opGroupingManager.js";
export {
	ensureContentsDeserialized,
	serializeOp,
} from "./opSerialization.js";
export { OpSplitter, isChunkedMessage, splitOp } from "./opSplitter.js";
export {
	type BatchResubmitInfo,
	Outbox,
	estimateSocketSize,
	getLongStack,
	localBatchToOutboundBatch,
} from "./outbox.js";
export {
	type BatchStartInfo,
	type InboundMessageResult,
	RemoteMessageProcessor,
	unpackRuntimeMessage,
} from "./remoteMessageProcessor.js";
