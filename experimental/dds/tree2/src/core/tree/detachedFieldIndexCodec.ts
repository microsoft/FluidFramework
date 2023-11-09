/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, IJsonCodec } from "../../codec";
import { fail, forEachInNestedMap, setInNestedMap } from "../../util";
import { ForestRootId } from "./detachedFieldIndex";
import { Format, Versioned, version } from "./detachedFieldIndexFormat";
import { DetachedFieldSummaryData, Major, Minor } from "./detachedFieldIndexTypes";

export function makeDetachedNodeToFieldCodec({
	jsonValidator: validator,
}: ICodecOptions): IJsonCodec<DetachedFieldSummaryData, string> {
	const versionedValidator = validator.compile(Versioned);
	const formatValidator = validator.compile(Format);
	return {
		encode: (data: DetachedFieldSummaryData): string => {
			const detachedNodeToFieldData: [Major, Minor, ForestRootId][] = [];
			forEachInNestedMap(data.data, (root, key1, key2) => {
				detachedNodeToFieldData.push([key1, key2, root]);
			});
			const encoded = {
				version,
				data: detachedNodeToFieldData,
				maxId: data.maxId,
			};
			assert(
				versionedValidator.check(encoded),
				"Encoded detachedNodeToField data should be versioned",
			);
			assert(formatValidator.check(encoded), "Encoded schema should validate");
			return JSON.stringify(encoded);
		},
		decode: (data: string): DetachedFieldSummaryData => {
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
			for (const [major, minor, root] of parsed.data) {
				setInNestedMap(map, major, minor, root);
			}
			return {
				data: map,
				maxId: parsed.maxId,
			};
		},
	};
}
