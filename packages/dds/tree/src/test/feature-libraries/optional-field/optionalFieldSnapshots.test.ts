/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IIdCompressor } from "@fluidframework/id-compressor";
import { ChangesetLocalId, RevisionTagCodec } from "../../../core/index.js";
import {
	OptionalChangeset,
	makeOptionalFieldCodecFamily,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import { brand, fail } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
// eslint-disable-next-line import/no-internal-modules
import { createSnapshotCompressor } from "../../snapshots/testTrees.js";
import { Change } from "./optionalFieldUtils.js";
import { TestNodeId } from "../../testNodeId.js";

function generateTestChangesets(
	idCompressor: IIdCompressor,
): { name: string; change: OptionalChangeset<TestChange> }[] {
	const revision = idCompressor.generateCompressedId();
	const localId: ChangesetLocalId = brand(42);
	const childChange = TestChange.mint([], 1);
	return [
		{
			name: "empty",
			change: Change.empty(),
		},
		{
			name: "change with moves",
			change: Change.atOnce(
				Change.move({ revision, localId }, "self"),
				Change.clear("self", { revision, localId }),
				Change.move(localId, localId),
			),
		},
		{
			name: "with child change",
			change: Change.atOnce(
				Change.childAt({ revision, localId }, childChange),
				Change.childAt(localId, childChange),
				Change.child(childChange),
			),
		},
		{
			name: "with reserved detach",
			change: Change.reserve("self", { revision, localId }),
		},
	];
}

export function testSnapshots() {
	describe("Snapshots", () => {
		useSnapshotDirectory("optional-field");
		const snapshotCompressor = createSnapshotCompressor();
		const changesets = generateTestChangesets(snapshotCompressor);
		const family = makeOptionalFieldCodecFamily<TestChange>(
			new RevisionTagCodec(snapshotCompressor),
		);

		const baseContext = {
			originatorId: snapshotCompressor.localSessionId,
		};

		for (const version of family.getSupportedFormats()) {
			describe(`version ${version}`, () => {
				const codec = family.resolve(version);
				for (const { name, change } of changesets) {
					it(name, () => {
						const encoded = codec.json.encode(change, {
							baseContext,
							encodeNode: (node) => TestNodeId.encode(node, baseContext),
							decodeNode: (node) => TestNodeId.decode(node, baseContext),
						});
						takeJsonSnapshot(encoded);
					});
				}
			});
		}
	});
}
