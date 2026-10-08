/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TSchema } from "typebox";

import type { CodecAndSchema, IJsonCodec } from "../../codec/index.js";
import {
	hasSingle,
	type JsonCompatibleReadOnly,
	type JsonCompatibleReadOnlyObject,
} from "../../util/index.js";

import {
	Format,
	type DetachedFieldIndexFormatVersion,
	type RootRanges,
} from "./detachedFieldIndexFormatCommon.js";
import type {
	DetachedField,
	DetachedFieldSummaryData,
	ForestRootId,
	Major,
} from "./detachedFieldIndexTypes.js";

type EncodedRootsForRevision<TEncodedRevisionTag extends JsonCompatibleReadOnly> =
	| [TEncodedRevisionTag, RootRanges]
	| [TEncodedRevisionTag, number, ForestRootId];

type EncodedFormat<
	TEncodedRevisionTag extends JsonCompatibleReadOnly,
	TVersion extends DetachedFieldIndexFormatVersion,
> = JsonCompatibleReadOnlyObject & {
	readonly version: TVersion;
	readonly data: EncodedRootsForRevision<TEncodedRevisionTag>[];
	readonly maxId: ForestRootId;
};

export function makeDetachedFieldIndexCodecFromMajorCodec<
	TEncodedRevisionTag extends JsonCompatibleReadOnly,
	TEncodedRevisionTagSchema extends TSchema,
	TVersion extends DetachedFieldIndexFormatVersion,
>(
	majorCodec: IJsonCodec<Major, TEncodedRevisionTag>,
	version: TVersion,
	encodedRevisionTagSchema: TEncodedRevisionTagSchema,
): CodecAndSchema<DetachedFieldSummaryData> {
	const formatSchema = Format(version, encodedRevisionTagSchema);
	type Format = EncodedFormat<TEncodedRevisionTag, TVersion>;
	return {
		schema: formatSchema,
		encode: (data: DetachedFieldSummaryData): Format => {
			const rootsForRevisions: EncodedRootsForRevision<TEncodedRevisionTag>[] = [];
			for (const [major, innerMap] of data.data) {
				const encodedRevision = majorCodec.encode(major);
				const rootRanges: RootRanges = [];
				for (const [minor, detachedField] of innerMap) {
					rootRanges.push([minor, detachedField.root]);
				}
				if (hasSingle(rootRanges)) {
					const firstRootRange = rootRanges[0];
					const rootsForRevision: EncodedRootsForRevision<TEncodedRevisionTag> = [
						encodedRevision,
						firstRootRange[0],
						firstRootRange[1],
					];
					rootsForRevisions.push(rootsForRevision);
				} else {
					const rootsForRevision: EncodedRootsForRevision<TEncodedRevisionTag> = [
						encodedRevision,
						rootRanges,
					];
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
		decode: (data: JsonCompatibleReadOnly): DetachedFieldSummaryData => {
			// CodecAndSchema invokes decode only after validating data against formatSchema.
			const parsed = data as Format;
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
	};
}
