/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import type { IIdCompressor } from "@fluidframework/id-compressor";

import { type ChangesetLocalId, RevisionTagCodec } from "../../../core/index.js";
import {
	type OptionalChangeset,
	makeOptionalFieldCodecFamily,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";
import { brand } from "../../../util/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
// eslint-disable-next-line import/no-internal-modules
import { createSnapshotCompressor } from "../../snapshots/snapshotTestScenarios.js";
import { TestNodeId } from "../../testNodeId.js";
import { Change } from "./optionalFieldUtils.js";
import { TestChange } from "../../testChange.js";
import { testIdCompressor } from "../../utils.js";

function generateTestChangesets(
	idCompressor: IIdCompressor,
): { name: string; change: OptionalChangeset }[] {
	const revision = idCompressor.generateCompressedId();
	const localId: ChangesetLocalId = brand(42);
	const childChange = TestNodeId.create({ localId: brand(5) }, TestChange.mint([], 1));
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
		{
			name: "pin",
			change: Change.pin({ revision, localId }),
		},
	];
}

export function testSnapshots() {
	describe("Snapshots", () => {
		const snapshotCompressor = createSnapshotCompressor();
		const changesets = generateTestChangesets(snapshotCompressor);
		const family = makeOptionalFieldCodecFamily(new RevisionTagCodec(snapshotCompressor));

		const baseContext = {
			originatorId: snapshotCompressor.localSessionId,
			revision: undefined,
			idCompressor: testIdCompressor,
		};

		for (const version of family.getSupportedFormats()) {
			describe(`version ${version}`, () => {
				const dir = path.join("optional-field", `V${version}`);
				useSnapshotDirectory(dir);
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
