/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, IJsonCodec } from "../codec";
import { fail } from "../util";
import { FieldKey } from "../core";
import { Format, Versioned, version } from "./forestSummarizerFormat";
import { EncodedChunk } from "./chunked-forest";

// TODO: As of now this codec does not contain that much logic on encoding, and mainly provides a codec which version stamps,
// and validates the format of the data. Eventually we will want to add more logic in here.
export function makeForestSummarizerCodec({
	jsonValidator: validator,
}: ICodecOptions): IJsonCodec<[FieldKey, EncodedChunk][], Format> {
	const versionedValidator = validator.compile(Versioned);
	const formatValidator = validator.compile(Format);
	return {
		encode: (data: [FieldKey, EncodedChunk][]): Format => {
			const encoded = {
				version,
				data,
			};
			assert(versionedValidator.check(encoded), 0x837 /* Encoded data should be versioned */);
			assert(formatValidator.check(encoded), 0x838 /* Encoded schema should validate */);
			return encoded;
		},
		decode: (data: Format): [FieldKey, EncodedChunk][] => {
			if (!versionedValidator.check(data)) {
				fail("invalid serialized data: did not have a version");
			}
			// When more versions exist, we can switch on the version here.
			if (data.version !== version) {
				fail("Unexpected version for serialized data");
			}
			if (!formatValidator.check(data)) {
				fail("Serialized data failed validation");
			}

			return data.data;
		},
	};
}
