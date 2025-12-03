/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";

import {
	type CodecTree,
	type CodecWriteOptions,
	type IJsonCodec,
	makeVersionedValidatedCodec,
} from "../../codec/index.js";
import type { FieldKey, ITreeCursorSynchronous } from "../../core/index.js";
import type { FieldBatchCodec, FieldBatchEncodingContext } from "../chunked-forest/index.js";

import { Format, ForestFormatVersion } from "./format.js";
import { brand } from "../../util/index.js";

/**
 * Uses field cursors
 */
export type FieldSet = ReadonlyMap<FieldKey, ITreeCursorSynchronous>;
export type ForestCodec = IJsonCodec<FieldSet, Format, Format, FieldBatchEncodingContext>;

/**
 * Convert a MinimumVersionForCollab to a ForestFormatVersion.
 * @param clientVersion - The MinimumVersionForCollab to convert.
 * @returns The ForestFormatVersion that corresponds to the provided MinimumVersionForCollab.
 */
function clientVersionToForestSummaryVersion(
	clientVersion: MinimumVersionForCollab,
): ForestFormatVersion {
	// Currently, forest summary codec only writes in version 1.
	return brand(ForestFormatVersion.v1);
}

export function makeForestSummarizerCodec(
	options: CodecWriteOptions,
	fieldBatchCodec: FieldBatchCodec,
): ForestCodec {
	const inner = fieldBatchCodec;
	// TODO: AB#41865
	// This needs to be updated to support multiple versions.
	// The second version will be used to enable incremental summarization.
	const writeVersion = clientVersionToForestSummaryVersion(options.minVersionForCollab);
	return makeVersionedValidatedCodec(options, new Set([ForestFormatVersion.v1]), Format, {
		encode: (data: FieldSet, context: FieldBatchEncodingContext): Format => {
			const keys: FieldKey[] = [];
			const fields: ITreeCursorSynchronous[] = [];
			for (const [key, value] of data) {
				keys.push(key);
				fields.push(value);
			}
			return { keys, fields: inner.encode(fields, context), version: writeVersion };
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

export function getCodecTreeForForestFormat(
	clientVersion: MinimumVersionForCollab,
): CodecTree {
	return { name: "Forest", version: clientVersionToForestSummaryVersion(clientVersion) };
}
