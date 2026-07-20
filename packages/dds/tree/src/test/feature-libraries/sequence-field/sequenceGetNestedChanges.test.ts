/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangeAtomId, RevisionTag } from "../../../core/index.js";
import type { NodeId } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { NestedChangesInfo } from "../../../feature-libraries/modular-schema/fieldChangeHandler.js";
// eslint-disable-next-line import-x/no-internal-modules
import { sequenceFieldChangeHandler } from "../../../feature-libraries/sequence-field/sequenceFieldChangeHandler.js";
import { brand } from "../../../util/index.js";
import { mintRevisionTag } from "../../utils.js";

import { MarkMaker as Mark } from "./testEdits.js";

const tag1: RevisionTag = mintRevisionTag();
const nodeId1: NodeId = { localId: brand(1) };
const nodeId2: NodeId = { localId: brand(2) };

export function testGetNestedChanges(): void {
	describe("getNestedChanges", () => {
		it("is empty for an empty change", () => {
			const change = sequenceFieldChangeHandler.createEmpty();
			const actual = sequenceFieldChangeHandler.getNestedChanges(change);
			assert.deepEqual(actual, []);
		});
		it("includes changes to nodes in the field", () => {
			const detachedId: ChangeAtomId = { revision: tag1, localId: brand(42) };
			const change = [
				Mark.remove(1, detachedId, { changes: nodeId1 }),
				{ count: 42 },
				Mark.modify(nodeId2),
			];
			const actual = sequenceFieldChangeHandler.getNestedChanges(change);
			const expected: NestedChangesInfo = [
				{ nodeId: nodeId1, inputDetachedId: undefined, outputDetachedId: detachedId },
				{ nodeId: nodeId2, inputDetachedId: undefined, outputDetachedId: undefined },
			];
			assert.deepEqual(actual, expected);
		});
		it("includes changes to removed nodes", () => {
			const cellId1: ChangeAtomId = { revision: tag1, localId: brand(42) };
			const cellId2: ChangeAtomId = { revision: tag1, localId: brand(43) };
			const change = [
				Mark.revive(1, cellId1, { changes: nodeId1 }),
				Mark.modify(nodeId2, cellId2),
			];
			const actual = sequenceFieldChangeHandler.getNestedChanges(change);
			const expected: NestedChangesInfo = [
				{ nodeId: nodeId1, inputDetachedId: cellId1, outputDetachedId: undefined },
				{ nodeId: nodeId2, inputDetachedId: cellId2, outputDetachedId: cellId2 },
			];
			assert.deepEqual(actual, expected);
		});
	});
}
