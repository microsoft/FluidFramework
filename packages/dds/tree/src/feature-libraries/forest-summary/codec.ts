/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";

import {
	type ICodecOptions,
	type IJsonCodec,
	makeVersionedValidatedCodec,
} from "../../codec/index.js";
import type { FieldKey, ITreeCursorSynchronous } from "../../core/index.js";
import type { FieldBatchCodec, FieldBatchEncodingContext } from "../chunked-forest/index.js";

import { Format } from "./format.js";

/**
 * Uses field cursors
 */
export type FieldSet = ReadonlyMap<FieldKey, ITreeCursorSynchronous>;
export type ForestCodec = IJsonCodec<FieldSet, Format, Format, FieldBatchEncodingContext>;

export function makeForestSummarizerCodec(
	options: ICodecOptions,
	fieldBatchCodec: FieldBatchCodec,
): ForestCodec {
	const inner = fieldBatchCodec;
	return makeVersionedValidatedCodec(options, new Set([1]), Format, {
		encode: (data: FieldSet, context: FieldBatchEncodingContext): Format => {
			const keys: FieldKey[] = [];
			const fields: ITreeCursorSynchronous[] = [];
			for (const [key, value] of data) {
				keys.push(key);
				fields.push(value);
			}
			return { keys, fields: inner.encode(fields, context), version: 1 };
		},
		decode: (data: Format, context: FieldBatchEncodingContext): FieldSet => {
			const out: Map<FieldKey, ITreeCursorSynchronous> = new Map();
			const fields = inner.decode(data.fields, context);
			assert(data.keys.length === fields.length, 0x891 /* mismatched lengths */);
			for (const [index, field] of fields.entries()) {
				out.set(data.keys[index] ?? oob(), field);
			}
			return out;
		},
	});
}
