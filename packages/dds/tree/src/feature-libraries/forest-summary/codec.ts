/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, IJsonCodec, makeVersionedValidatedCodec } from "../../codec/index.js";
import { FieldKey, ITreeCursorSynchronous } from "../../core/index.js";
import { FieldBatchCodec } from "../chunked-forest/index.js";
import { Format } from "./format.js";

/**
 * Uses field cursors
 */
export type FieldSet = ReadonlyMap<FieldKey, ITreeCursorSynchronous>;
export type ForestCodec = IJsonCodec<FieldSet, Format, Format>;

export function makeForestSummarizerCodec(
	options: ICodecOptions,
	fieldBatchCodec: FieldBatchCodec,
): ForestCodec {
	const inner = fieldBatchCodec;
	return makeVersionedValidatedCodec(options, new Set([1]), Format, {
		encode: (data: FieldSet): Format => {
			const keys: FieldKey[] = [];
			const fields: ITreeCursorSynchronous[] = [];
			for (const [key, value] of data) {
				keys.push(key);
				fields.push(value);
			}
			return { keys, fields: inner.encode(fields), version: 1 };
		},
		decode: (data: Format): FieldSet => {
			const out: Map<FieldKey, ITreeCursorSynchronous> = new Map();
			const fields = inner.decode(data.fields);
			assert(data.keys.length === fields.length, "mismatched lengths");
			for (let index = 0; index < fields.length; index++) {
				out.set(data.keys[index], fields[index]);
			}
			return out;
		},
	});
}
