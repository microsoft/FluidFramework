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
import { DetachedFieldSummaryData, Minor } from "./detachedFieldIndexTypes";

export class DetachedNodeToFieldCodec implements IJsonCodec<DetachedFieldSummaryData, string> {
	public constructor(
		private readonly idCompressor: IIdCompressor,
		private readonly options: ICodecOptions,
	) {}

	public encode(data: DetachedFieldSummaryData): string {
		const versionedValidator = this.options.jsonValidator.compile(Versioned);
		const formatValidator = this.options.jsonValidator.compile(Format);
		const detachedNodeToFieldData: [EncodedRevisionTag, Minor, ForestRootId, SessionId][] = [];
		forEachInNestedMap(data.data, (root, key1, key2) => {
			detachedNodeToFieldData.push([
				key1 === "root"
					? "root"
					: (this.idCompressor.normalizeToOpSpace(key1) as EncodedRevisionTag),
				key2,
				root,
				this.idCompressor.localSessionId,
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
		for (const [major, minor, root, sessionId] of parsed.data) {
			const revision =
				major === "root"
					? "root"
					: this.idCompressor.normalizeToSessionSpace(major, sessionId);
			setInNestedMap(map, revision, minor, root);
		}
		return {
			data: map,
			maxId: parsed.maxId,
		};
	}
}
