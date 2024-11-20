/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type ICodecOptions,
	type IJsonCodec,
	makeVersionedValidatedCodec,
} from "../../codec/index.js";
import type { EncodedRevisionTag, RevisionTagCodec, RevisionTag } from "../rebase/index.js";

import {
	type EncodedRootsForRevision,
	Format,
	type RootRanges,
	version,
} from "./detachedFieldIndexFormat.js";
import type {
	DetachedField,
	DetachedFieldSummaryData,
	Major,
} from "./detachedFieldIndexTypes.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { hasSingle } from "../../util/index.js";

class MajorCodec implements IJsonCodec<Major> {
	public constructor(
		private readonly revisionTagCodec: RevisionTagCodec,
		private readonly options: ICodecOptions,
		private readonly idCompressor: IIdCompressor,
	) {}

	public encode(major: Major): EncodedRevisionTag {
		assert(major !== undefined, 0x88e /* Unexpected undefined revision */);
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
			0x88f /* Expected final id on encode of detached field index revision */,
		);
		return id;
	}

	public decode(major: EncodedRevisionTag): RevisionTag {
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

export function makeDetachedNodeToFieldCodec(
	revisionTagCodec: RevisionTagCodec,
	options: ICodecOptions,
	idCompressor: IIdCompressor,
): IJsonCodec<DetachedFieldSummaryData, Format> {
	const majorCodec = new MajorCodec(revisionTagCodec, options, idCompressor);
	return makeVersionedValidatedCodec(options, new Set([version]), Format, {
		encode: (data: DetachedFieldSummaryData): Format => {
			const rootsForRevisions: EncodedRootsForRevision[] = [];
			for (const [major, innerMap] of data.data) {
				const encodedRevision = majorCodec.encode(major);
				const rootRanges: RootRanges = [];
				for (const [minor, detachedField] of innerMap) {
					rootRanges.push([minor, detachedField.root]);
				}
				if (hasSingle(rootRanges)) {
					const firstRootRange = rootRanges[0];
					const rootsForRevision: EncodedRootsForRevision = [
						encodedRevision,
						firstRootRange[0],
						firstRootRange[1],
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
				const innerMap = new Map<number, DetachedField>();
				if (rootsForRevision.length === 2) {
					for (const [minor, root] of rootsForRevision[1]) {
						innerMap.set(minor, { root });
					}
				} else {
					innerMap.set(rootsForRevision[1], { root: rootsForRevision[2] });
				}
				map.set(majorCodec.decode(rootsForRevision[0]), innerMap);
			}
			return {
				data: map,
				maxId: parsed.maxId,
			};
		},
	});
}
