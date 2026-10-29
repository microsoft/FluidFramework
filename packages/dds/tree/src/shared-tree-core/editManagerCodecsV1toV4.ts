/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";

import type { CodecAndSchema, IJsonCodec, Versioned } from "../codec/index.js";
import type { ChangeEncodingContext, EncodedRevisionTag, RevisionTag } from "../core/index.js";
import {
	type JsonCompatibleReadOnly,
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlySchema,
	unbrand,
} from "../util/index.js";

import type { SummaryData } from "./editManager.js";
import {
	decodeSharedBranch,
	encodeSharedBranch,
	type EditManagerDecodingContext,
	type EditManagerEncodingContext,
} from "./editManagerCodecsCommons.js";
import { EncodedEditManager } from "./editManagerFormatV1toV4.js";
import { EditManagerFormatVersion } from "./editManagerFormatCommons.js";

/**
 * Create the provided version of the {@link EditManager} codec (which encodes it's {@link SummaryData}).
 * @remarks
 * The changeCodec and revisionTagCodec are not explicitly versioned, so the exact right version of them must be provided here
 * or data will be incompatible.
 *
 * TODO: this file should be renamed as this is used for v6 as well.
 */
export function makeV1toV4andV6CodecWithVersion<TChangeset>(
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
	version: EncodedEditManager<TChangeset>["version"],
): CodecAndSchema<
	SummaryData<TChangeset>,
	EditManagerEncodingContext<TChangeset>,
	EditManagerDecodingContext
> {
	const includeCustomMetadata = doesVersionSupportCustomMetadata(version);
	const schema = EncodedEditManager(
		changeCodec.encodedSchema ?? JsonCompatibleReadOnlySchema,
		includeCustomMetadata,
	);

	const codec: CodecAndSchema<
		SummaryData<TChangeset>,
		EditManagerEncodingContext<TChangeset>,
		EditManagerDecodingContext
	> = {
		schema,
		encode: (
			data: SummaryData<TChangeset>,
			context: EditManagerEncodingContext<TChangeset>,
		): EncodedEditManager<TChangeset> & Versioned & JsonCompatibleReadOnlyObject => {
			const mainBranch = encodeSharedBranch(
				changeCodec,
				revisionTagCodec,
				data.main,
				context,
				data.originator,
				includeCustomMetadata,
			);
			const encoded: EncodedEditManager<JsonCompatibleReadOnly> = {
				trunk: mainBranch.trunk,
				branches: mainBranch.peers,
				version,
			};
			return encoded as EncodedEditManager<TChangeset> &
				Versioned &
				JsonCompatibleReadOnlyObject;
		},
		decode: (
			json: EncodedEditManager<TChangeset> & JsonCompatibleReadOnly,
			context: EditManagerDecodingContext,
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
					undefined, // Non "vSharedBranches" versions do not encode the summary originatorId.
				),
			};
		},
	};
	return codec;
}

function doesVersionSupportCustomMetadata(version: EditManagerFormatVersion): boolean {
	switch (version) {
		case unbrand(EditManagerFormatVersion.v1):
		case unbrand(EditManagerFormatVersion.v2):
		case unbrand(EditManagerFormatVersion.v3):
		case unbrand(EditManagerFormatVersion.v4):
		case unbrand(EditManagerFormatVersion.v5):
		case unbrand(EditManagerFormatVersion.v6): {
			return false;
		}
		case unbrand(EditManagerFormatVersion.v7):
		case unbrand(EditManagerFormatVersion.vSharedBranches):
		case unbrand(EditManagerFormatVersion.vDetachedRoots): {
			return true;
		}
		default: {
			unreachableCase(version);
		}
	}
}
