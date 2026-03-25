/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	addBatchMetadata,
	type BatchId,
	BatchManager,
	type BatchSequenceNumbers,
	generateBatchId,
	getEffectiveBatchId,
	type IBatchManagerOptions,
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
	isGroupedBatch,
	OpGroupingManager,
	type OpGroupingManagerConfig,
} from "./opGroupingManager.js";
export {
	ensureContentsDeserialized,
	serializeOp,
} from "./opSerialization.js";
export { isChunkedMessage, OpSplitter, splitOp } from "./opSplitter.js";
export {
	type BatchResubmitInfo,
	estimateSocketSize,
	getLongStack,
	localBatchToOutboundBatch,
	Outbox,
} from "./outbox.js";
export {
	type BatchStartInfo,
	type InboundMessageResult,
	RemoteMessageProcessor,
	unpackRuntimeMessage,
} from "./remoteMessageProcessor.js";
