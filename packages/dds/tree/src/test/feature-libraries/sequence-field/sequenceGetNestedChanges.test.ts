/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { NodeId } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { sequenceFieldChangeHandler } from "../../../feature-libraries/sequence-field/index.js";
import { brand } from "../../../util/index.js";
import { MarkMaker as Mark } from "./testEdits.js";
import type { RevisionTag } from "../../../core/index.js";
import { mintRevisionTag } from "../../utils.js";
import type { NestedChangesIndices } from "../../../feature-libraries/modular-schema/fieldChangeHandler.js";

const tag1: RevisionTag = mintRevisionTag();
const nodeId1: NodeId = { localId: brand(1) };
const nodeId2: NodeId = { localId: brand(2) };

export function testGetNestedChanges() {
	describe("getNestedChanges", () => {
		it("is empty for an empty change", () => {
			const change = sequenceFieldChangeHandler.createEmpty();
			const actual = sequenceFieldChangeHandler.getNestedChanges(change);
			assert.deepEqual(actual, []);
		});
		it("includes changes to nodes in the field", () => {
			const change = [Mark.modify(nodeId1), { count: 42 }, Mark.modify(nodeId2)];
			const actual = sequenceFieldChangeHandler.getNestedChanges(change);
			const expected: NestedChangesIndices = [
				[nodeId1, 0, 0],
				[nodeId2, 43, 43],
			];
			assert.deepEqual(actual, expected);
		});
		it("includes changes to removed nodes", () => {
			const change = [
				Mark.revive(1, { revision: tag1, localId: brand(42) }, { changes: nodeId1 }),
				Mark.modify(nodeId2, { revision: tag1, localId: brand(43) }),
			];
			const actual = sequenceFieldChangeHandler.getNestedChanges(change);
			const expected: NestedChangesIndices = [
				[nodeId1, undefined, 0],
				[nodeId2, undefined, undefined],
			];
			assert.deepEqual(actual, expected);
		});
	});
}
