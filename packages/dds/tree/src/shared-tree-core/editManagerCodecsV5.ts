/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
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
import {
	type JsonCompatibleReadOnly,
	JsonCompatibleReadOnlySchema,
	type Mutable,
} from "../util/index.js";

import type { SharedBranchSummaryData, SummaryData } from "./editManager.js";
import { EncodedEditManager } from "./editManagerFormatV5.js";
import { decodeSharedBranch, encodeSharedBranch } from "./editManagerCodecsCommons.js";
import type { EncodedSharedBranch } from "./editManagerFormatCommons.js";

export interface EditManagerEncodingContext {
	idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
}

export function makeV5CodecWithVersion<TChangeset>(
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
			encode: (data: SummaryData<TChangeset>, context: EditManagerEncodingContext) => {
				const mainBranch = encodeSharedBranch(
					changeCodec,
					revisionTagCodec,
					data.main,
					context,
				);
				const json: Mutable<EncodedEditManager<TChangeset>> = {
					main: mainBranch,
					version,
				};
				if (data.branches.size > 0) {
					const branches: EncodedSharedBranch<TChangeset>[] = [];
					for (const [_, branch] of data.branches) {
						branches.push(encodeSharedBranch(changeCodec, revisionTagCodec, branch, context));
					}
					json.branches = branches;
				}
				return json;
			},
			decode: (
				json: EncodedEditManager<TChangeset>,
				context: EditManagerEncodingContext,
			): SummaryData<TChangeset> => {
				const mainBranch = decodeSharedBranch(
					changeCodec,
					revisionTagCodec,
					json.main,
					context,
				);
				const branches = new Map<string, SharedBranchSummaryData<TChangeset>>();
				if (json.branches !== undefined) {
					for (const branch of json.branches) {
						const decodedBranch = decodeSharedBranch(
							changeCodec,
							revisionTagCodec,
							branch,
							context,
						);
						assert(decodedBranch.id !== undefined, "Shared branches must have an id");
						assert(!branches.has(decodedBranch.id), "Duplicate shared branch id");
						branches.set(decodedBranch.id, decodedBranch);
					}
				}
				return {
					main: mainBranch,
					branches,
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
