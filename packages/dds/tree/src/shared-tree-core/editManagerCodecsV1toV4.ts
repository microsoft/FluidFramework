/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";

import {
	type ICodecOptions,
	type IJsonCodec,
	type IMultiFormatCodec,
	withSchemaValidation,
} from "../codec/index.js";
import type {
	ChangeEncodingContext,
	EncodedRevisionTag,
	RevisionTag,
	SchemaAndPolicy,
} from "../core/index.js";
import { type JsonCompatibleReadOnly, JsonCompatibleReadOnlySchema } from "../util/index.js";

import type { SummaryData } from "./editManager.js";
import { EncodedEditManager } from "./editManagerFormatV1toV4.js";
import { decodeSharedBranch, encodeSharedBranch } from "./editManagerCodecsCommons.js";

export interface EditManagerEncodingContext {
	idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
}

export function makeV1CodecWithVersion<TChangeset>(
	changeCodec: IMultiFormatCodec<
		TChangeset,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		ChangeEncodingContext
	>,
	revisionTagCodec: IJsonCodec<
		RevisionTag,
		EncodedRevisionTag,
		EncodedRevisionTag,
		ChangeEncodingContext
	>,
	options: ICodecOptions,
	version: EncodedEditManager<TChangeset>["version"],
): IJsonCodec<
	SummaryData<TChangeset>,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	EditManagerEncodingContext
> {
	const format = EncodedEditManager(
		changeCodec.json.encodedSchema ?? JsonCompatibleReadOnlySchema,
	);

	const codec: IJsonCodec<
		SummaryData<TChangeset>,
		EncodedEditManager<TChangeset>,
		EncodedEditManager<TChangeset>,
		EditManagerEncodingContext
	> = withSchemaValidation(
		format,
		{
			encode: (data, context: EditManagerEncodingContext) => {
				const mainBranch = encodeSharedBranch(
					changeCodec,
					revisionTagCodec,
					data.main,
					context,
					data.originator,
				);
				const json: EncodedEditManager<TChangeset> = {
					trunk: mainBranch.trunk,
					branches: mainBranch.peers,
					version,
				};
				return json;
			},
			decode: (
				json: EncodedEditManager<TChangeset>,
				context: EditManagerEncodingContext,
			): SummaryData<TChangeset> => {
				return {
					main: decodeSharedBranch(
						changeCodec,
						revisionTagCodec,
						{
							trunk: json.trunk,
							peers: json.branches,
						},
						context,
						undefined, // originatorId is not encoded in v1
					),
				};
			},
		},
		options.jsonValidator,
	);
	// TODO: makeVersionedValidatedCodec and withSchemaValidation should allow the codec to decode JsonCompatibleReadOnly, or Versioned or something like that,
	// and not leak the internal encoded format in the API surface.
	// Fixing that would remove the need for this cast.
	return codec as unknown as IJsonCodec<
		SummaryData<TChangeset>,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		EditManagerEncodingContext
	>;
}
