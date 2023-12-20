/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IIdCompressor, SessionId } from "@fluidframework/id-compressor";
import { ICodecOptions, IJsonCodec } from "../../codec";
import { fail, forEachInNestedMap, setInNestedMap } from "../../util";
import { EncodedRevisionTag } from "../rebase";
import { ForestRootId } from "./detachedFieldIndex";
import { Format, Versioned, version } from "./detachedFieldIndexFormat";
import { DetachedFieldSummaryData, Major, Minor } from "./detachedFieldIndexTypes";
import { RevisionTagCodec } from "../../shared-tree-core";

class MajorCodec implements IJsonCodec<Major> {
	private readonly revisionTagCodec: RevisionTagCodec;
	public constructor (private readonly idCompressor: IIdCompressor, private readonly options: ICodecOptions) {
		this.revisionTagCodec = new RevisionTagCodec(idCompressor);
	}

	public encode(major: Major) {
		if (major === undefined) {
			return null;
		}
		const id = this.revisionTagCodec.encode(major);
		/**
		 * Note that the decode path must provide a session id in which to interpret the revision tag.
		 * The revision associated with a detached root generally comes from the session which detaches that subtree,
		 * which isn't generally the local session (nor is it available at decode time), despite decode using
		 * the local session id.
		 * 
		 * This is made OK by enforcing that all ids on encode/decode are non-local, since local ids won't be interpretable
		 * at decode time.
		 * This assert is valid because the revision for an acked edit will have already been finalized, and a revision
		 * for a local-only edit will be finalizable at summarization time (local edits can only occur on a summarizing client
		 * if they're created while detached, and local ids made while detached are finalized before generating the attach summary).
		 */
		assert(id === 'root' || id >= 0, "Expected final id on encode of detached field index revision");
		return id;
	}

	public decode(major: EncodedRevisionTag) {
		if (major === null) {
			return undefined;
		}
		assert(major === 'root' || major >= 0, "Expected final id on decode of detached field index revision");
		return this.revisionTagCodec.decode(major, this.idCompressor.localSessionId);
	}
}


export class DetachedNodeToFieldCodec implements IJsonCodec<DetachedFieldSummaryData, string> {
	private readonly majorCodec: MajorCodec;

	public constructor(
		idCompressor: IIdCompressor,
		private readonly options: ICodecOptions,
	) {
		this.majorCodec = new MajorCodec(idCompressor, options);
	}

	public encode(data: DetachedFieldSummaryData): string {
		const versionedValidator = this.options.jsonValidator.compile(Versioned);
		const formatValidator = this.options.jsonValidator.compile(Format);
		const detachedNodeToFieldData: [EncodedRevisionTag | null, Minor, ForestRootId][] = [];
		forEachInNestedMap(data.data, (root, key1, key2) => {
			detachedNodeToFieldData.push([
				this.majorCodec.encode(key1),
				key2,
				root,
			]);
		});
		const encoded = {
			version,
			data: detachedNodeToFieldData,
			maxId: data.maxId,
		};
		assert(
			versionedValidator.check(encoded),
			0x7ff /* Encoded detachedNodeToField data should be versioned */,
		);
		assert(formatValidator.check(encoded), 0x800 /* Encoded schema should validate */);
		return JSON.stringify(encoded);
	}

	public decode(data: string): DetachedFieldSummaryData {
		const versionedValidator = this.options.jsonValidator.compile(Versioned);
		const formatValidator = this.options.jsonValidator.compile(Format);
		const parsed = JSON.parse(data);

		if (!versionedValidator.check(parsed)) {
			fail("invalid serialized data: did not have a version");
		}
		// When more versions exist, we can switch on the version here.
		if (parsed.version !== version) {
			fail("Unexpected version for serialized data");
		}
		if (!formatValidator.check(parsed)) {
			fail("Serialized data failed validation");
		}
		const map = new Map();
		for (const [encodedMajor, minor, root] of parsed.data) {
			const major = this.majorCodec.decode(encodedMajor);
			setInNestedMap(map, major, minor, root);
		}
		return {
			data: map,
			maxId: parsed.maxId,
		};
	}
}
