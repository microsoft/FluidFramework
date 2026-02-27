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
import {
	fieldBatchCodecBuilder,
	type FieldBatchEncodingContext,
} from "../chunked-forest/index.js";

import { ForestFormatVersion, FormatCommon } from "./formatCommon.js";

/**
 * Uses field cursors
 */
export type FieldSet = ReadonlyMap<FieldKey, ITreeCursorSynchronous>;
export type ForestCodec = ReturnType<typeof forestCodecBuilder.build>;

function makeForestSummarizerCodec(
	options: CodecWriteOptions,
	version: ForestFormatVersion,
): CodecAndSchema<FieldSet, FieldBatchEncodingContext> {
	// Performance: Since multiple places (including multiple versions of this codec) use the field batch codec,
	// we may end up with multiple copies of it, including compiling its format validation multiple times.
	// This is not ideal, but is not too bad as it is a small fixed number of copies and thus should not be too expensive.
	// If this becomes problematic a cache could be added for options to codec instances somewhere.
	const fieldBatchCodec = fieldBatchCodecBuilder.build(options);
	const formatSchema = FormatCommon;
	return {
		encode: (data: FieldSet, context: FieldBatchEncodingContext): FormatCommon => {
			const keys: FieldKey[] = [];
			const fields: ITreeCursorSynchronous[] = [];
			for (const [key, cursor] of data) {
				keys.push(key);
				fields.push(cursor);
			}
			return {
				keys,
				fields: fieldBatchCodec.encode(fields, context),
				version,
			};
		},
		decode: (data: FormatCommon, context: FieldBatchEncodingContext): FieldSet => {
			const out = new Map<FieldKey, ITreeCursorSynchronous>();
			const fields = fieldBatchCodec.decode(data.fields, context);
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
		codec: (options: CodecWriteOptions) =>
			makeForestSummarizerCodec(options, ForestFormatVersion.v1),
	},
	{
		minVersionForCollab: FluidClientVersion.v2_74,
		formatVersion: ForestFormatVersion.v2,
		codec: (options: CodecWriteOptions) =>
			makeForestSummarizerCodec(options, ForestFormatVersion.v2),
	},
]);
