/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { TUnsafe } from "@sinclair/typebox";

import {
	eraseEncodedType,
	type ICodecOptions,
	type IJsonCodec,
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
import { decodeSharedBranch, encodeSharedBranch } from "./editManagerCodecsCommons.js";
import { EncodedEditManager } from "./editManagerFormatV1toV4.js";

export interface EditManagerEncodingContext {
	idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
}

export function makeV1CodecWithVersion<TChangeset>(
	changeCodec: IJsonCodec<
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
		changeCodec.encodedSchema ?? JsonCompatibleReadOnlySchema,
	) as TUnsafe<EncodedEditManager<TChangeset>>;

	const codec: IJsonCodec<
		SummaryData<TChangeset>,
		EncodedEditManager<TChangeset>,
		JsonCompatibleReadOnly,
		EditManagerEncodingContext
	> = withSchemaValidation(
		format,
		{
			encode: (data: SummaryData<TChangeset>, context: EditManagerEncodingContext) => {
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
	return eraseEncodedType(codec);
}
