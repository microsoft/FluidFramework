/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor, StableId } from "@fluidframework/id-compressor";

import { type ICodecOptions, type IJsonCodec } from "../../codec/index.js";
import {
	type EncodedRevisionTag,
	type RevisionTagCodec,
	type RevisionTag,
} from "../rebase/index.js";

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
			assert(major !== "root", "Major revision cannot be 'root'");
			const long = this.idCompressor.decompress(major);
			return long;
		}
		/**
		 * Preface: this codec is only used at summarization time (not for ops).
		 * Note that the decode path must provide a session id in which to interpret the revision tag.
		 * The revision associated with a detached root generally comes from the session which detaches that subtree,
		 * which isn't generally the local session (nor is it available at decode time with the layering of the tree
		 * package), despite decode using the local session id.
		 *
		 * This is made OK by enforcing that all ids on encode/decode are non-local, since local ids won't be interpretable
		 * at decode time.
		 * This assert is valid because the revision for an acked edit will have already been finalized, and a revision
		 * for a local-only edit will be finalizable at summarization time (local edits can only occur on a summarizing client
		 * if they're created while detached, and local ids made while detached are finalized before generating the attach summary).
		 */
		assert(
			id === "root" || id >= 0,
			0x88f /* Expected final id on encode of detached field index revision */,
		);
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
