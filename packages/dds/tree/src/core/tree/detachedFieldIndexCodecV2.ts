/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor, StableId } from "@fluidframework/id-compressor";

import type { ICodecOptions, IJsonCodec } from "../../codec/index.js";
import type { EncodedRevisionTag, RevisionTagCodec, RevisionTag } from "../rebase/index.js";

import {
	type FormatV2,
	StableOrFinalRevisionTag,
	version2,
} from "./detachedFieldIndexFormatV2.js";
import type { DetachedFieldSummaryData, Major } from "./detachedFieldIndexTypes.js";
import { makeDetachedFieldIndexCodecFromMajorCodec } from "./detachedFieldIndexCodecCommon.js";
import { isStableId } from "@fluidframework/id-compressor/internal";

class MajorCodec implements IJsonCodec<Major> {
	public constructor(
		private readonly revisionTagCodec: RevisionTagCodec,
		private readonly options: ICodecOptions,
		private readonly idCompressor: IIdCompressor,
	) {}

	public encode(major: Major): EncodedRevisionTag | StableId {
		assert(major !== undefined, 0x88e /* Unexpected undefined revision */);
		const id = this.revisionTagCodec.encode(major);

		if (id !== "root" && id < 0) {
			/**
			 * This code path handles the case where the major revision is not finalized.
			 * This can happen the SharedTree is being attached to an already attached container.
			 */
			assert(major !== "root", "Major revision cannot be 'root'");
			const long = this.idCompressor.decompress(major);
			return long;
		}
		return id;
	}

	public decode(major: EncodedRevisionTag | StableId): RevisionTag {
		if (typeof major === "string" && isStableId(major)) {
			return this.idCompressor.recompress(major);
		}
		assert(
			major === "root" || major >= 0,
			0x890 /* Expected final id on decode of detached field index revision */,
		);
		return this.revisionTagCodec.decode(major, {
			originatorId: this.revisionTagCodec.localSessionId,
			idCompressor: this.idCompressor,
			revision: undefined,
		});
	}
}

export function makeDetachedNodeToFieldCodecV2(
	revisionTagCodec: RevisionTagCodec,
	options: ICodecOptions,
	idCompressor: IIdCompressor,
): IJsonCodec<DetachedFieldSummaryData, FormatV2> {
	const majorCodec = new MajorCodec(revisionTagCodec, options, idCompressor);
	return makeDetachedFieldIndexCodecFromMajorCodec(
		options,
		majorCodec,
		version2,
		StableOrFinalRevisionTag,
	);
}
