/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IIdCompressor } from "@fluidframework/id-compressor";
import { ICodecOptions, IJsonCodec, makeVersionedValidatedCodec } from "../../codec";
import { forEachInNestedMap, setInNestedMap } from "../../util";
import { EncodedRevisionTag, RevisionTagCodec } from "../rebase";
import { Format, version } from "./detachedFieldIndexFormat";
import { DetachedFieldSummaryData, Major } from "./detachedFieldIndexTypes";

class MajorCodec implements IJsonCodec<Major> {
	private readonly revisionTagCodec: RevisionTagCodec;
	public constructor(
		private readonly idCompressor: IIdCompressor,
		private readonly options: ICodecOptions,
	) {
		this.revisionTagCodec = new RevisionTagCodec(idCompressor);
	}

	public encode(major: Major) {
		if (major === undefined) {
			return null;
		}
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

	// JSON round-trips undefined values to 'null' within arrays.
	// eslint-disable-next-line @rushstack/no-new-null
	public decode(major: EncodedRevisionTag | null) {
		if (major === null) {
			return undefined;
		}
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
			const detachedNodeToFieldData: Format["data"] = [];
			forEachInNestedMap(data.data, (root, key1, key2) => {
				const encodedMajor = majorCodec.encode(key1);
				detachedNodeToFieldData.push([encodedMajor, key2, root]);
			});
			const encoded: Format = {
				version,
				data: detachedNodeToFieldData,
				maxId: data.maxId,
			};
			return encoded;
		},
		decode: (parsed: Format): DetachedFieldSummaryData => {
			const map = new Map();
			for (const [encodedMajor, minor, root] of parsed.data) {
				const major = majorCodec.decode(encodedMajor);
				setInNestedMap(map, major, minor, root);
			}
			return {
				data: map,
				maxId: parsed.maxId,
			};
		},
	});
}
