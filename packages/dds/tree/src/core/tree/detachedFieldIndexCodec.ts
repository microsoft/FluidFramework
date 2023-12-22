/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecOptions, IJsonCodec, makeVersionedValidatedCodec } from "../../codec";
import { forEachInNestedMap, setInNestedMap } from "../../util";
import { ForestRootId } from "./detachedFieldIndex";
import { Format, version } from "./detachedFieldIndexFormat";
import { DetachedFieldSummaryData, Major, Minor } from "./detachedFieldIndexTypes";

export function makeDetachedNodeToFieldCodec(
	options: ICodecOptions,
): IJsonCodec<DetachedFieldSummaryData, Format> {
	return makeVersionedValidatedCodec(options, new Set([version]), Format, {
		encode: (data: DetachedFieldSummaryData): Format => {
			const detachedNodeToFieldData: [Major, Minor, ForestRootId][] = [];
			forEachInNestedMap(data.data, (root, key1, key2) => {
				detachedNodeToFieldData.push([key1, key2, root]);
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
			for (const [major, minor, root] of parsed.data) {
				setInNestedMap(map, major, minor, root);
			}
			return {
				data: map,
				maxId: parsed.maxId,
			};
		},
	});
}
