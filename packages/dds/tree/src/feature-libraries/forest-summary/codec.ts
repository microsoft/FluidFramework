/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";

import {
	ClientVersionDispatchingCodecBuilder,
	type CodecAndSchema,
	type CodecWriteOptions,
	FluidClientVersion,
} from "../../codec/index.js";
import type { FieldKey, ITreeCursorSynchronous } from "../../core/index.js";
import type { FieldBatchCodec, FieldBatchEncodingContext } from "../chunked-forest/index.js";

import { ForestFormatVersion, type Format, FormatCommon } from "./formatCommon.js";

/**
 * Uses field cursors
 */
export type FieldSet = ReadonlyMap<FieldKey, ITreeCursorSynchronous>;
export type ForestCodec = ReturnType<typeof forestCodecBuilder.build>;

/**
 * Options for building the forest summarizer codec.
 * @remarks
 * Extends {@link CodecWriteOptions} with the required `fieldBatchCodec` dependency.
 */
export interface ForestCodecOptions extends CodecWriteOptions {
	/**
	 * Codec for encoding the field batches in the forest summary.
	 * @privateRemarks
	 * TODO: Select this automatically.
	 * This is kept for now to limit the scope of changes done at the same time.
	 */
	readonly fieldBatchCodec: FieldBatchCodec;
}

function makeForestSummarizerCodec(
	options: ForestCodecOptions,
	version: ForestFormatVersion,
): CodecAndSchema<FieldSet, FieldBatchEncodingContext> {
	const formatSchema = FormatCommon(version);
	return {
		encode: (data: FieldSet, context: FieldBatchEncodingContext): Format => {
			const keys: FieldKey[] = [];
			const fields: ITreeCursorSynchronous[] = [];
			for (const [key, value] of data) {
				keys.push(key);
				fields.push(value);
			}
			return {
				keys,
				fields: options.fieldBatchCodec.encode(fields, context),
				version,
			};
		},
		decode: (data: Format, context: FieldBatchEncodingContext): FieldSet => {
			const out: Map<FieldKey, ITreeCursorSynchronous> = new Map();
			const fields = options.fieldBatchCodec.decode(data.fields, context);
			assert(data.keys.length === fields.length, 0x891 /* mismatched lengths */);
			for (const [index, field] of fields.entries()) {
				out.set(data.keys[index] ?? oob(), field);
			}
			return out;
		},
		schema: formatSchema,
	};
}

/**
 * {@link ClientVersionDispatchingCodecBuilder} for forest summarizer codecs.
 */
export const forestCodecBuilder = ClientVersionDispatchingCodecBuilder.build("Forest", [
	{
		minVersionForCollab: lowestMinVersionForCollab,
		formatVersion: ForestFormatVersion.v1,
		codec: (options: ForestCodecOptions) =>
			makeForestSummarizerCodec(options, ForestFormatVersion.v1),
	},
	{
		minVersionForCollab: FluidClientVersion.v2_74,
		formatVersion: ForestFormatVersion.v2,
		codec: (options: ForestCodecOptions) =>
			makeForestSummarizerCodec(options, ForestFormatVersion.v2),
	},
]);
