/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, IJsonCodec, makeVersionedValidatedCodec } from "../../codec";
import { EncodedRevisionTag, RevisionTag } from "../rebase";
import { EncodedRootsForRevision, Format, RootRanges, version } from "./detachedFieldIndexFormat";
import { DetachedFieldSummaryData } from "./detachedFieldIndexTypes";

export function makeDetachedNodeToFieldCodec(
	revisionTagCodec: IJsonCodec<RevisionTag, EncodedRevisionTag> | undefined,
	options: ICodecOptions,
): IJsonCodec<DetachedFieldSummaryData, Format> {
	return makeVersionedValidatedCodec(options, new Set([version]), Format, {
		encode: (data: DetachedFieldSummaryData): Format => {
			assert(
				revisionTagCodec !== undefined,
				"Cannot encode detached field index without revision tag codec",
			);
			const rootsForRevisions: EncodedRootsForRevision[] = [];
			for (const [major, innerMap] of data.data) {
				assert(major !== undefined, "Unexpected undefined revision");
				const rootRanges: RootRanges = [...innerMap];
				const rootsForRevision: EncodedRootsForRevision = [
					rootRanges,
					revisionTagCodec.encode(major),
				];
				rootsForRevisions.push(rootsForRevision);
			}
			const encoded: Format = {
				version,
				data: rootsForRevisions,
				maxId: data.maxId,
			};
			return encoded;
		},
		decode: (parsed: Format): DetachedFieldSummaryData => {
			assert(
				revisionTagCodec !== undefined,
				"Cannot decode detached field index without revision tag codec",
			);
			const map = new Map();
			for (const [rootRanges, revision] of parsed.data) {
				const innerMap = new Map(rootRanges);
				map.set(revision, innerMap);
			}
			return {
				data: map,
				maxId: parsed.maxId,
			};
		},
	});
}
