/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IIdCompressor, createIdCompressor } from "@fluidframework/id-compressor";
import { ChangesetLocalId, RevisionTagCodec } from "../../../core/index.js";
import {
	OptionalChangeset,
	makeOptionalFieldCodecFamily,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
// eslint-disable-next-line import/no-internal-modules
import { sessionId } from "../../snapshots/testTrees.js";

function generateTestChangesets(
	idCompressor: IIdCompressor,
): { name: string; change: OptionalChangeset<TestChange> }[] {
	const revision = idCompressor.generateCompressedId();
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
					["self", childChange],
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

export function testSnapshots() {
	describe("Snapshots", () => {
		useSnapshotDirectory("optional-field");
		const idCompressor = createIdCompressor(sessionId);
		const changesets = generateTestChangesets(idCompressor);
		idCompressor.finalizeCreationRange(idCompressor.takeNextCreationRange());
		const family = makeOptionalFieldCodecFamily(
			TestChange.codec,
			new RevisionTagCodec(idCompressor),
		);

		for (const version of family.getSupportedFormats()) {
			describe(`version ${version}`, () => {
				const codec = family.resolve(version);
				for (const { name, change } of changesets) {
					it(name, () => {
						const encoded = codec.json.encode(change, { originatorId: sessionId });
						takeJsonSnapshot(encoded);
					});
				}
			});
		}
	});
}
