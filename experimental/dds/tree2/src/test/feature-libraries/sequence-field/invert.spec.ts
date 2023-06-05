/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { mintRevisionTag, RevisionTag, tagChange } from "../../../core";
import { TestChange } from "../../testChange";
import { deepFreeze, fakeRepair } from "../../utils";
import { brand } from "../../../util";
import { composeAnonChanges, invert as invertChange } from "./utils";
import { ChangeMaker as Change, TestChangeset } from "./testEdits";

function invert(change: TestChangeset): TestChangeset {
	deepFreeze(change);
	return invertChange(tagChange(change, tag1));
}

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();

const childChange1 = TestChange.mint([0], 1);
const childChange2 = TestChange.mint([1], 2);
const childChange3 = TestChange.mint([2], 3);
const inverseChildChange1 = TestChange.invert(childChange1);
const inverseChildChange2 = TestChange.invert(childChange2);
const inverseChildChange3 = TestChange.invert(childChange3);

describe("SequenceField - Invert", () => {
	it("no changes", () => {
		const input: TestChangeset = [];
		const expected: TestChangeset = [];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("child changes", () => {
		const input = Change.modify(0, childChange1);
		const expected = Change.modify(0, inverseChildChange1);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("child changes of removed content", () => {
		const detachEvent = { revision: tag1, index: 0 };
		const input = Change.modifyDetached(0, childChange1, detachEvent);
		// TODO: use the line below once we apply modifications to removed content
		// const expected = Change.modifyDetached(0, inverseChildChange1, detachEvent);
		const actual = invert(input);
		assert.deepEqual(actual, []);
	});

	it("insert => delete", () => {
		const input = Change.insert(0, 2);
		const expected = Change.delete(0, 2);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("insert & modify => modify & delete", () => {
		const insert = Change.insert(0, 1);
		const nodeChange = TestChange.mint([], 42);
		const modify = Change.modify(0, nodeChange);
		const input = composeAnonChanges([insert, modify]);
		const inverseModify = Change.modify(0, TestChange.invert(nodeChange));
		const expected = composeAnonChanges([inverseModify, Change.delete(0, 1)]);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("delete => revive", () => {
		const input = composeAnonChanges([Change.modify(0, childChange1), Change.delete(0, 2)]);
		const expected = composeAnonChanges([
			Change.revive(0, 2, tag1, 0),
			Change.modify(0, inverseChildChange1),
		]);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("revert-only active revive => delete", () => {
		const revive = Change.revive(0, 2, tag1, 0);
		const modify = Change.modify(0, childChange1);
		const input = composeAnonChanges([revive, modify]);
		const expected = composeAnonChanges([
			Change.modify(0, inverseChildChange1),
			Change.delete(0, 2),
		]);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("intentional active revive => delete", () => {
		const input = Change.intentionalRevive(0, 2, tag1, 0);
		const expected = Change.delete(0, 2);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("move => return", () => {
		const input = composeAnonChanges([Change.modify(0, childChange1), Change.move(0, 2, 3)]);
		const expected = composeAnonChanges([
			Change.modify(3, inverseChildChange1),
			Change.return(3, 2, 0, tag1),
		]);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("move backward => return", () => {
		const input = composeAnonChanges([Change.modify(3, childChange1), Change.move(2, 2, 0)]);
		const expected = composeAnonChanges([
			Change.modify(1, inverseChildChange1),
			Change.return(0, 2, 2, tag1),
		]);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("return => return", () => {
		const input = composeAnonChanges([
			Change.modify(0, childChange1),
			Change.return(0, 2, 3, tag1),
		]);
		const expected = composeAnonChanges([
			Change.modify(3, inverseChildChange1),
			Change.return(3, 2, 0, tag1),
		]);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	describe("Redundant changes", () => {
		it("delete", () => {
			const detachEvent = { revision: tag1, index: 0 };
			const input: TestChangeset = [
				{
					type: "Delete",
					count: 1,
					changes: childChange1,
					detachEvent,
				},
			];

			const actual = invert(input);
			// TODO: use the line below once we apply modifications to removed content
			// const expected = Change.modifyDetached(0, inverseChildChange1, detachEvent);
			assert.deepEqual(actual, []);
		});

		it("move out", () => {
			const detachEvent = { revision: tag1, index: 0 };
			const input: TestChangeset = [
				{
					type: "MoveOut",
					count: 1,
					id: brand(0),
					changes: childChange1,
					detachEvent,
				},
				{
					type: "MoveIn",
					count: 1,
					id: brand(0),
					isSrcConflicted: true,
				},
			];

			const actual = invert(input);
			// TODO: use the line below once we apply modifications to removed content
			// const expected = Change.modifyDetached(0, inverseChildChange1, detachEvent);
			assert.deepEqual(actual, []);
		});

		it("revert-only redundant revive => skip", () => {
			const input: TestChangeset = [
				{
					type: "Modify",
					changes: childChange1,
				},
				{
					type: "Revive",
					content: fakeRepair(tag1, 0, 1),
					count: 1,
					inverseOf: tag1,
					changes: childChange2,
				},
				{
					type: "Modify",
					changes: childChange3,
				},
			];
			const expected = composeAnonChanges([
				Change.modify(0, inverseChildChange1),
				Change.modify(1, inverseChildChange2),
				Change.modify(2, inverseChildChange3),
			]);
			const actual = invert(input);
			assert.deepEqual(actual, expected);
		});

		it("revert-only blocked revive => no-op", () => {
			const input = composeAnonChanges([
				Change.modify(0, childChange1),
				Change.blockedRevive(1, 2, tag1, tag2),
				Change.modify(1, childChange2),
			]);
			const expected = composeAnonChanges([
				Change.modify(0, inverseChildChange1),
				Change.modify(1, inverseChildChange2),
			]);
			const actual = invert(input);
			assert.deepEqual(actual, expected);
		});

		it("intentional redundant revive => skip", () => {
			const input = composeAnonChanges([
				Change.modify(0, childChange1),
				Change.redundantRevive(1, 1, tag1, 1, undefined, true),
				Change.modify(2, childChange2),
			]);
			const expected = composeAnonChanges([
				Change.modify(0, inverseChildChange1),
				Change.modify(2, inverseChildChange2),
			]);
			const actual = invert(input);
			assert.deepEqual(actual, expected);
		});

		it("return-from + redundant return-to => skip + skip", () => {
			const input: TestChangeset = [
				{
					type: "ReturnFrom",
					count: 1,
					id: brand(0),
					isDstConflicted: true,
					changes: childChange1,
				},
				{
					type: "ReturnTo",
					count: 1,
					id: brand(0),
					detachEvent: { revision: tag2, index: 0 },
					inverseOf: tag1,
				},
				{
					type: "Modify",
					changes: childChange2,
				},
			];
			const actual = invert(input);
			const expected = composeAnonChanges([
				Change.modify(0, inverseChildChange1),
				Change.modify(1, inverseChildChange2),
			]);
			assert.deepEqual(actual, expected);
		});

		it("redundant move-out + move-in => nil + nil", () => {
			const input: TestChangeset = [
				{
					type: "MoveOut",
					count: 1,
					id: brand(0),
					detachEvent: { revision: tag2, index: 0 },
				},
				{
					type: "Modify",
					changes: childChange1,
				},
				{
					type: "MoveIn",
					count: 1,
					id: brand(0),
					isSrcConflicted: true,
				},
				{
					type: "Modify",
					changes: childChange2,
				},
			];
			const actual = invert(input);
			const expected = composeAnonChanges([
				Change.modify(0, inverseChildChange1),
				Change.modify(1, inverseChildChange2),
			]);
			assert.deepEqual(actual, expected);
		});

		it("redundant return-from + return to => nil + nil", () => {
			const input: TestChangeset = [
				{
					type: "ReturnFrom",
					count: 1,
					id: brand(0),
					detachEvent: { revision: tag2, index: 0 },
				},
				{
					type: "Modify",
					changes: childChange1,
				},
				{
					type: "ReturnTo",
					count: 1,
					id: brand(0),
					detachEvent: { revision: tag1, index: 0 },
					isSrcConflicted: true,
				},
				{
					type: "Modify",
					changes: childChange2,
				},
			];
			const actual = invert(input);
			const expected = composeAnonChanges([
				Change.modify(0, inverseChildChange1),
				Change.modify(1, inverseChildChange2),
			]);
			assert.deepEqual(actual, expected);
		});

		it("redundant return-from + redundant return-to => nil + skip", () => {
			const input: TestChangeset = [
				{
					type: "ReturnFrom",
					count: 1,
					id: brand(0),
					detachEvent: { revision: tag2, index: 0 },
					isDstConflicted: true,
				},
				{
					type: "Modify",
					changes: childChange1,
				},
				{
					type: "ReturnTo",
					count: 1,
					id: brand(0),
					isSrcConflicted: true,
				},
				{
					type: "Modify",
					changes: childChange2,
				},
			];
			const actual = invert(input);
			const expected = composeAnonChanges([
				Change.modify(0, inverseChildChange1),
				Change.modify(2, inverseChildChange2),
			]);
			assert.deepEqual(actual, expected);
		});
	});
});
