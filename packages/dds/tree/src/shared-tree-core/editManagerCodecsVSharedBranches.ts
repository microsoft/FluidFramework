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
import { EncodedEditManager } from "./editManagerFormatVSharedBranches.js";
import { decodeSharedBranch, encodeSharedBranch } from "./editManagerCodecsCommons.js";
import type { EncodedSharedBranch } from "./editManagerFormatCommons.js";
import type { BranchId } from "./branch.js";

export interface EditManagerEncodingContext {
	idCompressor: IIdCompressor;
	readonly schema?: SchemaAndPolicy;
}

export function makeSharedBranchesCodecWithVersion<TChangeset>(
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
					data.originator,
				);
				assert(
					data.originator !== undefined,
					0xca5 /* Cannot encode vSharedBranches summary without originator */,
				);
				const json: Mutable<EncodedEditManager<TChangeset>> = {
					main: mainBranch,
					originator: data.originator,
					version,
				};
				if (data.branches !== undefined && data.branches.size > 0) {
					const branches: EncodedSharedBranch<TChangeset>[] = [];
					for (const [_, branch] of data.branches) {
						branches.push(
							encodeSharedBranch(
								changeCodec,
								revisionTagCodec,
								branch,
								context,
								data.originator,
							),
						);
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
					json.originator,
				);

				const decoded: Mutable<SummaryData<TChangeset>> = {
					main: mainBranch,
					originator: json.originator,
				};

				if (json.branches !== undefined) {
					const branches = new Map<BranchId, SharedBranchSummaryData<TChangeset>>();
					for (const branch of json.branches) {
						const decodedBranch = decodeSharedBranch(
							changeCodec,
							revisionTagCodec,
							branch,
							context,
							json.originator,
						);
						assert(
							decodedBranch.id !== undefined,
							0xc66 /* Shared branches must have an id */,
						);
						assert(!branches.has(decodedBranch.id), 0xc67 /* Duplicate shared branch id */);
						branches.set(decodedBranch.id, decodedBranch);
					}

					decoded.branches = branches;
				}
				return decoded;
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
