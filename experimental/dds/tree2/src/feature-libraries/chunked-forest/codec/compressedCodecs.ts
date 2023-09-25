/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ITreeCursorSynchronous, SchemaData } from "../../../core";
import { fail } from "../../../util";
import { ICodecOptions, IJsonCodec } from "../../../codec";
import { FullSchemaPolicy } from "../../modular-schema";
import { EncodedChunk, Versioned, validVersions } from "./format";
import { decode } from "./chunkDecoding";
import { EncoderCache, compressedEncode } from "./compressedEncode";
import { schemaCompressedEncode } from "./schemaBasedEncoding";

export function makeCompressedCodec(
	{ jsonValidator: validator }: ICodecOptions,
	cache: EncoderCache,
): IJsonCodec<ITreeCursorSynchronous> {
	const versionedValidator = validator.compile(Versioned);
	const formatValidator = validator.compile(EncodedChunk);
	return {
		encode: (data: ITreeCursorSynchronous) => {
			const encoded = compressedEncode(data, cache);
			assert(versionedValidator.check(encoded), "Encoded schema should be versioned.");
			assert(formatValidator.check(encoded), "Encoded schema should validate");
			return encoded;
		},
		decode: (data: EncodedChunk): ITreeCursorSynchronous => {
			if (!versionedValidator.check(data)) {
				fail("invalid serialized schema: did not have a version");
			}
			if (!formatValidator.check(data)) {
				fail("Serialized schema failed validation");
			}
			if (!validVersions.has(data.version)) {
				fail("Unexpected version for schema");
			}
			return decode(data).cursor();
		},
	};
}

export function makeSchemaCompressedCodec(
	{ jsonValidator: validator }: ICodecOptions,
	schema: SchemaData,
	policy: FullSchemaPolicy,
): IJsonCodec<ITreeCursorSynchronous> {
	const versionedValidator = validator.compile(Versioned);
	const formatValidator = validator.compile(EncodedChunk);
	return {
		encode: (data: ITreeCursorSynchronous) => {
			const encoded = schemaCompressedEncode(schema, policy, data);
			assert(versionedValidator.check(encoded), "Encoded schema should be versioned");
			assert(formatValidator.check(encoded), "Encoded schema should validate");
			assert(encoded.version !== undefined, "");
			return encoded;
		},
		decode: (data: EncodedChunk): ITreeCursorSynchronous => {
			if (!versionedValidator.check(data)) {
				fail("invalid serialized schema: did not have a version");
			}
			if (!formatValidator.check(data)) {
				fail("Serialized schema failed validation");
			}
			if (!validVersions.has(data.version)) {
				fail("Unexpected version for schema");
			}
			return decode(data).cursor();
		},
	};
}
