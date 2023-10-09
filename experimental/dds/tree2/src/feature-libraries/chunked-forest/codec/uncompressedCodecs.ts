/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, IJsonCodec } from "../../../codec";
import { ITreeCursorSynchronous } from "../../../core";
import { fail } from "../../../util";
import { EncodedChunk, Versioned, validVersions } from "./format";
import { decode } from "./chunkDecoding";
import { uncompressedEncode } from "./uncompressedEncode";

export function makeUncompressedCodec({
	jsonValidator: validator,
}: ICodecOptions): IJsonCodec<ITreeCursorSynchronous> {
	const versionedValidator = validator.compile(Versioned);
	const formatValidator = validator.compile(EncodedChunk);
	return {
		encode: (data: ITreeCursorSynchronous) => {
			const encoded = uncompressedEncode(data);
			assert(
				versionedValidator.check(encoded),
				0x78e /* Encoded schema should be versioned */,
			);
			assert(formatValidator.check(encoded), 0x78f /* Encoded schema should validate */);
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
