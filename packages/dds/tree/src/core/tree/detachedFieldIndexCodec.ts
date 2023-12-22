/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, IJsonCodec, makeVersionedValidatedCodec } from "../../codec";
import { EncodedRevisionTag, RevisionTag } from "../rebase";
import { EncodedRootsForRevision, Format, RootRanges, version } from "./detachedFieldIndexFormat";
import { DetachedFieldSummaryData } from "./detachedFieldIndexTypes";
import { ForestRootId } from "./detachedFieldIndex";

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
				const encodedRevision = revisionTagCodec.encode(major);
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
			assert(
				revisionTagCodec !== undefined,
				"Cannot decode detached field index without revision tag codec",
			);
			const map = new Map();
			for (const rootsForRevision of parsed.data) {
				const innerMap = new Map<number, ForestRootId>(
					rootsForRevision.length === 2
						? rootsForRevision[1]
						: [[rootsForRevision[1], rootsForRevision[2]]],
				);
				map.set(revisionTagCodec.decode(rootsForRevision[0]), innerMap);
			}
			return {
				data: map,
				maxId: parsed.maxId,
			};
		},
	});
}
