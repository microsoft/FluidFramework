/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IIdCompressor } from "@fluidframework/id-compressor";
import { ICodecOptions, IJsonCodec, makeVersionedValidatedCodec } from "../../codec/index.js";
import { EncodedRevisionTag, RevisionTagCodec } from "../rebase/index.js";
import {
	EncodedRootsForRevision,
	Format,
	RootRanges,
	version,
} from "./detachedFieldIndexFormat.js";
import { DetachedFieldSummaryData, Major } from "./detachedFieldIndexTypes.js";
import { ForestRootId } from "./detachedFieldIndex.js";

class MajorCodec implements IJsonCodec<Major> {
	private readonly revisionTagCodec: RevisionTagCodec;
	public constructor(
		private readonly idCompressor: IIdCompressor,
		private readonly options: ICodecOptions,
	) {
		this.revisionTagCodec = new RevisionTagCodec(idCompressor);
	}

	public encode(major: Major) {
		assert(major !== undefined, "Unexpected undefined revision");
		const id = this.revisionTagCodec.encode(major);
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
			"Expected final id on encode of detached field index revision",
		);
		return id;
	}

	public decode(major: EncodedRevisionTag) {
		assert(
			major === "root" || major >= 0,
			"Expected final id on decode of detached field index revision",
		);
		return this.revisionTagCodec.decode(major, this.idCompressor.localSessionId);
	}
}

export function makeDetachedNodeToFieldCodec(
	idCompressor: IIdCompressor,
	options: ICodecOptions,
): IJsonCodec<DetachedFieldSummaryData, Format> {
	const majorCodec = new MajorCodec(idCompressor, options);
	return makeVersionedValidatedCodec(options, new Set([version]), Format, {
		encode: (data: DetachedFieldSummaryData): Format => {
			const rootsForRevisions: EncodedRootsForRevision[] = [];
			for (const [major, innerMap] of data.data) {
				const encodedRevision = majorCodec.encode(major);
				const rootRanges: RootRanges = [...innerMap];
				if (rootRanges.length === 1) {
					const rootsForRevision: EncodedRootsForRevision = [
						encodedRevision,
						rootRanges[0][0],
						rootRanges[0][1],
					];
					rootsForRevisions.push(rootsForRevision);
				} else {
					const rootsForRevision: EncodedRootsForRevision = [encodedRevision, rootRanges];
					rootsForRevisions.push(rootsForRevision);
				}
			}
			const encoded: Format = {
				version,
				data: rootsForRevisions,
				maxId: data.maxId,
			};
			return encoded;
		},
		decode: (parsed: Format): DetachedFieldSummaryData => {
			const map = new Map();
			for (const rootsForRevision of parsed.data) {
				const innerMap = new Map<number, ForestRootId>(
					rootsForRevision.length === 2
						? rootsForRevision[1]
						: [[rootsForRevision[1], rootsForRevision[2]]],
				);
				map.set(majorCodec.decode(rootsForRevision[0]), innerMap);
			}
			return {
				data: map,
				maxId: parsed.maxId,
			};
		},
	});
}
