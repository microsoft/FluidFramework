/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";

import type { SchemaPolicy, StoredSchemaCollection } from "../../../core/index.js";
import { brand } from "../../../util/index.js";

import type { IncrementalEncoder } from "./codecs.js";
import { compressedEncode } from "./compressedEncode.js";
import type { FieldBatch } from "./fieldBatch.js";
import {
	type EncodedFieldBatchVTextExperimental,
	FieldBatchFormatVersion,
} from "./format/index.js";
import {
	type SpecializedNodeEncoderPolicy,
	baseNodeEncoders,
	buildContext,
} from "./schemaBasedEncode.js";

/**
 * Decides how an encode uses specialized (`f`) shapes.
 * @remarks
 * The encoder calls the strategy one time for each encode, before it encodes anything.
 * The strategy can read the batch, for example to count values, and then returns the
 * {@link SpecializedNodeEncoderPolicy} for the encode.
 *
 * The returned policy and the node encoders it chooses also apply to every incremental chunk
 * encoded during the same encode, even though each chunk is written as its own batch.
 * `fieldBatch` includes the content of those incremental chunks,
 * including unchanged chunks whose earlier encoding the summary reuses without encoding them again.
 * A strategy that reads the whole batch therefore costs a full pass over the tree on every summary.
 *
 * A strategy changes only the size of the encoded data and the time to encode it.
 * It does not change the format: the decoder can read all specialized shapes.
 *
 * The encoder does not check the node encoders that a strategy returns.
 * The strategy must make sure that each node encoder can encode each node that it gets.
 * For example, a shape that keeps a field value as a constant must get only nodes with that value,
 * and an identifier field must keep its identifier encoding.
 *
 * A strategy that reads the batch must leave each cursor in `fieldBatch` where it found it.
 */
export type SpecializationStrategy = (
	fieldBatch: FieldBatch,
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
) => SpecializedNodeEncoderPolicy;

/**
 * A {@link SpecializationStrategy} that never specializes.
 * It does not read the batch, and it uses the base node encoder for each node type.
 */
export const noSpecialization: SpecializationStrategy = () => baseNodeEncoders;

/**
 * Encodes data from `fieldBatch` in the {@link FieldBatchFormatVersion.vTextExperimental} format.
 * @remarks
 * `strategy` decides which nodes use specialized (`f`) shapes.
 * See {@link SpecializationStrategy}.
 *
 * With the default strategy, {@link noSpecialization}, the output differs from the V2 output only in its version.
 */
export function schemaCompressedEncodeVTextExperimental(
	schema: StoredSchemaCollection,
	policy: SchemaPolicy,
	fieldBatch: FieldBatch,
	idCompressor: IIdCompressor,
	incrementalEncoder: IncrementalEncoder | undefined,
	isSummary: boolean,
	strategy: SpecializationStrategy = noSpecialization,
): EncodedFieldBatchVTextExperimental {
	return compressedEncode(
		fieldBatch,
		buildContext(
			schema,
			policy,
			idCompressor,
			incrementalEncoder,
			brand(FieldBatchFormatVersion.vTextExperimental),
			isSummary,
			strategy(fieldBatch, schema, policy),
		),
	);
}
