/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ICodecOptions,
	type IJsonCodec,
	makeVersionedValidatedCodec,
} from "../../codec/index.js";
import { hasSingle } from "../../util/index.js";

import {
	Format,
	type EncodedRootsForRevision,
	type RootRanges,
} from "./detachedFieldIndexFormatCommon.js";
import type {
	DetachedField,
	DetachedFieldSummaryData,
	Major,
} from "./detachedFieldIndexTypes.js";
import type { Static, TSchema } from "@sinclair/typebox";

export function makeDetachedFieldIndexCodecFromMajorCodec<
	TEncodedRevisionTag,
	TEncodedRevisionTagSchema extends TSchema,
	TVersion extends number,
>(
	options: ICodecOptions,
	majorCodec: IJsonCodec<Major, TEncodedRevisionTag>,
	version: TVersion,
	encodedRevisionTagSchema: TEncodedRevisionTagSchema,
) {
	const formatSchema = Format(version, encodedRevisionTagSchema);
	return makeVersionedValidatedCodec(options, new Set([version]), formatSchema, {
		encode: (data: DetachedFieldSummaryData): Static<typeof formatSchema> => {
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
			const encoded: Static<typeof formatSchema> = {
				version,
				data: rootsForRevisions,
				maxId: data.maxId,
			};
			return encoded;
		},
		decode: (parsed: Static<typeof formatSchema>): DetachedFieldSummaryData => {
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
				const revision = rootsForRevision[0] as TEncodedRevisionTag;
				map.set(majorCodec.decode(revision), innerMap);
			}
			return {
				data: map,
				maxId: parsed.maxId,
			};
		},
	});
}
