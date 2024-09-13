/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GenericChangeset } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeGenericChangeCodec } from "../../../feature-libraries/modular-schema/genericFieldKindCodecs.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
// eslint-disable-next-line import/no-internal-modules
import { snapshotSessionId } from "../../snapshots/snapshotTestScenarios.js";
import { brand } from "../../../util/index.js";
import { TestNodeId } from "../../testNodeId.js";
import { TestChange } from "../../testChange.js";
import { testIdCompressor } from "../../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { newGenericChangeset } from "../../../feature-libraries/modular-schema/genericFieldKindTypes.js";

const nodeChange = TestNodeId.create({ localId: brand(0) }, TestChange.mint([], 1));
const testChangesets: { name: string; change: GenericChangeset }[] = [
	{
		name: "empty",
		change: newGenericChangeset(),
	},
	{
		name: "one change",
		change: newGenericChangeset([[42, nodeChange]]),
	},
	{
		name: "several changes",
		change: newGenericChangeset([
			[0, nodeChange],
			[1, nodeChange],
			[42, nodeChange],
		]),
	},
];

export function testSnapshots() {
	describe("Snapshots", () => {
		useSnapshotDirectory("generic-field");
		const family = makeGenericChangeCodec();
		for (const version of family.getSupportedFormats()) {
			describe(`version ${version}`, () => {
				const codec = family.resolve(version);
				for (const { name, change } of testChangesets) {
					it(name, () => {
						const encoded = codec.json.encode(change, {
							baseContext,
							encodeNode: (nodeId) => TestNodeId.encode(nodeId, baseContext),
							decodeNode: (nodeId) => TestNodeId.decode(nodeId, baseContext),
						});
						takeJsonSnapshot(encoded);
					});
				}
			});
		}
	});
}

const baseContext = {
	originatorId: snapshotSessionId,
	revision: undefined,
	idCompressor: testIdCompressor,
};
