/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { ChangesetLocalId } from "../../../core/index.js";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import { TestNodeId } from "../../testNodeId.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";
import { MarkMaker as Mark } from "./testEdits.js";

const id: ChangesetLocalId = brand(0);

export function testEditor() {
	describe("Editor", () => {
		it("child change", () => {
			const childChange = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
			deepFreeze(childChange);
			const actual = SF.sequenceFieldEditor.buildChildChange(42, childChange);
			const expected: SF.Changeset = [{ count: 42 }, Mark.modify(childChange)];
			assert.deepEqual(actual, expected);
		});

		it("insert one node", () => {
			const actual = SF.sequenceFieldEditor.insert(42, 1, id);
			const expected: SF.Changeset = [{ count: 42 }, Mark.revive(1, { localId: id })];
			assert.deepEqual(actual, expected);
		});

		it("insert multiple nodes", () => {
			const actual = SF.sequenceFieldEditor.insert(42, 2, id);
			const expected: SF.Changeset = [{ count: 42 }, Mark.insert(2, id)];
			assert.deepEqual(actual, expected);
		});

		it("remove", () => {
			const actual = SF.sequenceFieldEditor.remove(42, 3, id);
			const expected: SF.Changeset = [{ count: 42 }, Mark.remove(3, id)];
			assert.deepEqual(actual, expected);
		});
	});
}
