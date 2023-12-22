/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangesetLocalId } from "../../core/index.js";
import {
	OptionalChangeset,
	makeOptionalFieldCodecFamily,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/optional-field/index.js";
import { RevisionTagCodec } from "../../shared-tree-core/index.js";
import { brand, generateStableId, useDeterministicStableId } from "../../util/index.js";
import { TestChange } from "../testChange.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";

function generateTestChangesets(): { name: string; change: OptionalChangeset<TestChange> }[] {
	const revision = generateStableId();
	const localId: ChangesetLocalId = brand(42);
	const childChange = TestChange.mint([], 1);
	return [
		{
			name: "empty",
			change: {
				moves: [],
				childChanges: [],
			},
		},
		{
			name: "change with moves",
			change: {
				moves: [
					[{ revision, localId }, "self", "nodeTargeting"],
					["self", { revision, localId }, "cellTargeting"],
					[{ localId }, { localId }, "nodeTargeting"],
				],
				childChanges: [],
			},
		},
		{
			name: "with child change",
			change: {
				moves: [],
				childChanges: [
					[{ revision, localId }, childChange],
					[{ localId }, childChange],
				],
			},
		},
		{
			name: "with reserved detach on self",
			change: {
				moves: [],
				childChanges: [],
				reservedDetachId: "self",
			},
		},
		{
			name: "with reserved detach not on self",
			change: {
				moves: [],
				childChanges: [],
				reservedDetachId: { revision, localId },
			},
		},
	];
}

describe("OptionalField - Snapshots", () => {
	useSnapshotDirectory("optional-field");
	const family = makeOptionalFieldCodecFamily(TestChange.codec, new RevisionTagCodec());
	for (const version of family.getSupportedFormats()) {
		describe(`version ${version}`, () => {
			const codec = family.resolve(version);
			useDeterministicStableId(() => {
				for (const { name, change } of generateTestChangesets()) {
					it(name, () => {
						const encoded = codec.json.encode(change);
						takeJsonSnapshot(encoded);
					});
				}
			});
		});
	}
});
