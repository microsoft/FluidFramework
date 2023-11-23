/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangesetLocalId } from "../../../core";
import { SequenceField as SF } from "../../../feature-libraries";
import { brand } from "../../../util";
import { deepFreeze } from "../../utils";
import { TestChange } from "../../testChange";
import { TestChangeset, MarkMaker as Mark } from "./testEdits";

const id: ChangesetLocalId = brand(0);

describe("SequenceField - Editor", () => {
	it("child change", () => {
		const childChange = TestChange.mint([0], 1);
		deepFreeze(childChange);
		const actual = SF.sequenceFieldEditor.buildChildChange(42, childChange);
		const expected: TestChangeset = [{ count: 42 }, Mark.modify(childChange)];
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

	it("delete", () => {
		const actual = SF.sequenceFieldEditor.delete(42, 3, id);
		const expected: SF.Changeset = [{ count: 42 }, Mark.delete(3, id)];
		assert.deepEqual(actual, expected);
	});
});
