/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GenericChangeset } from "../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { makeGenericChangeCodec } from "../../feature-libraries/modular-schema/genericFieldKindCodecs";
import { TestChange } from "../testChange";
import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools";
import { sessionId } from "./testTrees";

const nodeChange = TestChange.mint([], 1);
const testChangesets: { name: string; change: GenericChangeset<TestChange> }[] = [
	{
		name: "empty",
		change: [],
	},
	{
		name: "one change",
		change: [{ index: 42, nodeChange }],
	},
	{
		name: "several changes",
		change: [
			{ index: 0, nodeChange },
			{ index: 1, nodeChange },
			{ index: 42, nodeChange },
		],
	},
];

describe("GenericField - Snapshots", () => {
	useSnapshotDirectory("generic-field");
	const family = makeGenericChangeCodec(TestChange.codec);
	for (const version of family.getSupportedFormats()) {
		describe(`version ${version}`, () => {
			const codec = family.resolve(version);
			for (const { name, change } of testChangesets) {
				it(name, () => {
					const encoded = codec.json.encode(change, sessionId);
					takeJsonSnapshot(encoded);
				});
			}
		});
	}
});
