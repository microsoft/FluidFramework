/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, IJsonCodec, makeVersionedValidatedCodec } from "../../codec";
import { brand } from "../../util";
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
				const rootRanges: RootRanges = [];
				const remainder = new Map(innerMap);
				for (const [minor, root] of remainder) {
					remainder.delete(minor);
					let minMinor = minor;
					let minRoot = root;
					while (remainder.get(minMinor - 1) === minRoot - 1) {
						minMinor -= 1;
						minRoot = brand(minRoot - 1);
						remainder.delete(minMinor);
					}
					let maxMinor = minor;
					let maxRoot = root;
					while (remainder.get(maxMinor + 1) === maxRoot + 1) {
						maxMinor += 1;
						maxRoot = brand(maxRoot + 1);
						remainder.delete(maxMinor);
					}
					const count = maxMinor - minMinor + 1;
					rootRanges.push(count === 1 ? [minMinor, minRoot] : [minMinor, minRoot, count]);
				}
				const rootsForRevision: EncodedRootsForRevision =
					major === undefined
						? [rootRanges]
						: [rootRanges, revisionTagCodec.encode(major)];
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
			for (const rootsForRevision of parsed.data) {
				const major =
					rootsForRevision.length === 2
						? revisionTagCodec.decode(rootsForRevision[1])
						: undefined;
				const innerMap = new Map();
				for (const rootRange of rootsForRevision[0]) {
					const [minor, root, count] = rootRange;
					for (let iRoot = (count ?? 1) - 1; iRoot >= 0; iRoot -= 1) {
						innerMap.set(minor + iRoot, root + iRoot);
					}
				}
				map.set(major, innerMap);
			}
			return {
				data: map,
				maxId: parsed.maxId,
			};
		},
	});
}
