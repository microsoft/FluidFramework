/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import {
	getConfigForMinVersionForCollab,
	lowestMinVersionForCollab,
} from "@fluidframework/runtime-utils/internal";

import {
	ClientVersionDispatchingCodecBuilder,
	type CodecWriteOptions,
	FluidClientVersion,
	type IJsonCodec,
} from "../../codec/index.js";
import type { FieldKey, ITreeCursorSynchronous } from "../../core/index.js";
import { brand, type JsonCompatibleReadOnly } from "../../util/index.js";
import type { FieldBatchCodec, FieldBatchEncodingContext } from "../chunked-forest/index.js";

import { ForestFormatVersion, type Format, FormatCommon } from "./formatCommon.js";

/**
 * Uses field cursors
 */
export type FieldSet = ReadonlyMap<FieldKey, ITreeCursorSynchronous>;
export type ForestCodec = IJsonCodec<
	FieldSet,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	FieldBatchEncodingContext
>;

/**
 * Options for building the forest summarizer codec.
 * Extends CodecWriteOptions with the required fieldBatchCodec dependency.
 */
export interface ForestCodecOptions extends CodecWriteOptions {
	readonly fieldBatchCodec: FieldBatchCodec;
}

/**
 * Convert a MinimumVersionForCollab to a ForestFormatVersion.
 * @param clientVersion - The MinimumVersionForCollab to convert.
 * @returns The ForestFormatVersion that corresponds to the provided MinimumVersionForCollab.
 */
export function clientVersionToForestFormatVersion(
	clientVersion: MinimumVersionForCollab,
): ForestFormatVersion {
	return brand(
		getConfigForMinVersionForCollab(clientVersion, {
			[lowestMinVersionForCollab]: ForestFormatVersion.v1,
			[FluidClientVersion.v2_74]: ForestFormatVersion.v2,
		}),
	);
}

/**
 * Codec builder for forest summarizer codecs.
 * Uses ClientVersionDispatchingCodecBuilder to dispatch to the appropriate version based on minVersionForCollab.
 */
export const forestCodecBuilder = ClientVersionDispatchingCodecBuilder.build("Forest", {
	[lowestMinVersionForCollab]: {
		formatVersion: ForestFormatVersion.v1,
		codec: (options: ForestCodecOptions) => {
			const writeVersion = ForestFormatVersion.v1;
			const formatSchema = FormatCommon(writeVersion);
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
						version: writeVersion,
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
		},
	},
	[FluidClientVersion.v2_74]: {
		formatVersion: ForestFormatVersion.v2,
		codec: (options: ForestCodecOptions) => {
			const writeVersion = ForestFormatVersion.v2;
			const formatSchema = FormatCommon(writeVersion);
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
						version: writeVersion,
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
		},
	},
});
