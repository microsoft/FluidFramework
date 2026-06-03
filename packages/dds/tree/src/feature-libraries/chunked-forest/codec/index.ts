/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ChunkReferenceId,
	type FieldBatchCodec,
	type FieldBatchEncodingContext,
	fieldBatchCodecBuilder,
	type IncrementalDecoder,
	type IncrementalEncoder,
	type IncrementalEncoderDecoder,
} from "./codecs.js";
export type { FieldBatch } from "./fieldBatch.js";
export type {
	EncodedFieldBatchV1,
	EncodedFieldBatchV1OrV2,
	EncodedFieldBatchV2,
} from "./format/index.js";
export { FieldBatchFormatVersion } from "./format/index.js";
export {
	defaultIncrementalEncodingPolicy,
	type IncrementalEncodingPolicy,
} from "./incrementalEncodingPolicy.js";
