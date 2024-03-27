/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GenericChangeset } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeGenericChangeCodec } from "../../../feature-libraries/modular-schema/genericFieldKindCodecs.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
// eslint-disable-next-line import/no-internal-modules
import { snapshotSessionId } from "../../snapshots/testTrees.js";
import { TestChange } from "../../testChange.js";

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

export function testSnapshots() {
	describe("Snapshots", () => {
		useSnapshotDirectory("generic-field");
		const family = makeGenericChangeCodec(TestChange.codec);
		for (const version of family.getSupportedFormats()) {
			describe(`version ${version}`, () => {
				const codec = family.resolve(version);
				for (const { name, change } of testChangesets) {
					it(name, () => {
						const encoded = codec.json.encode(change, {
							originatorId: snapshotSessionId,
						});
						takeJsonSnapshot(encoded);
					});
				}
			});
		}
	});
}
