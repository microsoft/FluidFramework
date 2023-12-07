/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ChangeAtomId,
	DeltaDetachedNodeId,
	makeAnonChange,
	mintRevisionTag,
	tagChange,
} from "../../../core";
import { SequenceField as SF } from "../../../feature-libraries";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { TestChangeset, MarkMaker as Mark } from "./testEdits";

const tag = mintRevisionTag();
const atomId: ChangeAtomId = { localId: brand(0) };
const deltaId: DeltaDetachedNodeId = { minor: atomId.localId };
const childChange = TestChange.mint([0], 1);
const relevantNestedTree = { minor: 4242 };
const oneTreeDelegate = (child: TestChange) => {
	assert.deepEqual(child, childChange);
	return [relevantNestedTree];
};
const noTreeDelegate = (child: TestChange) => {
	assert.deepEqual(child, childChange);
	return [];
};

describe("SequenceField - relevantRemovedRoots", () => {
	describe("does not include", () => {
		it("a tree that remains in-doc", () => {
			const input: TestChangeset = [{ count: 1 }];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, []);
		});
		it("a tree with child changes that remains in-doc", () => {
			const input: TestChangeset = [Mark.modify(childChange)];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, []);
		});
		it("a tree that remains removed", () => {
			const input: TestChangeset = [{ count: 1, cellId: atomId }];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, []);
		});
		it("a tree being removed", () => {
			const input: TestChangeset = [Mark.delete(1, atomId)];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, []);
		});
		it("a tree with child changes being removed", () => {
			const input: TestChangeset = [Mark.delete(1, atomId, { changes: childChange })];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, []);
		});
		it("a tree being moved", () => {
			const input: TestChangeset = [Mark.moveOut(1, atomId), Mark.moveIn(1, atomId)];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, []);
		});
		it("a tree with child changes being moved", () => {
			const input: TestChangeset = [
				Mark.moveOut(1, atomId, { changes: childChange }),
				Mark.moveIn(1, atomId),
			];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, []);
		});
		it("a live tree being pinned", () => {
			const input: TestChangeset = [Mark.pin(1, brand(0))];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, []);
		});
	});
	describe("does include", () => {
		it("a tree being inserted", () => {
			const input: TestChangeset = [Mark.insert(1, atomId)];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId]);
		});
		it("a tree being transiently inserted", () => {
			const input: TestChangeset = [
				Mark.attachAndDetach(Mark.insert(1, atomId), Mark.delete(1, atomId)),
			];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId]);
		});
		it("a tree being transiently inserted and moved out", () => {
			const input: TestChangeset = [
				Mark.attachAndDetach(Mark.insert(1, atomId), Mark.moveOut(1, atomId)),
			];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId]);
		});
		it("relevant roots from nested changes under a tree that remains in-doc", () => {
			const input: TestChangeset = [Mark.modify(childChange)];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), oneTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [relevantNestedTree]);
		});
		it("relevant roots from nested changes under a tree that remains removed", () => {
			const input: TestChangeset = [Mark.modify(childChange, atomId)];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), oneTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId, relevantNestedTree]);
		});
		it("a removed tree with nested changes", () => {
			const input: TestChangeset = [Mark.modify(childChange, atomId)];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId]);
		});
		it("a tree being restored by revive", () => {
			const input: TestChangeset = [Mark.revive(1, atomId)];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId]);
		});
		it("a tree being restored by pin", () => {
			const input: TestChangeset = [Mark.pin(1, brand(0), { cellId: atomId })];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId]);
		});
		it("a tree being transiently restored", () => {
			const input: TestChangeset = [Mark.delete(1, brand(0), { cellId: atomId })];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), noTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId]);
		});
		it("relevant roots from nested changes under a tree being restored by revive", () => {
			const input: TestChangeset = [Mark.revive(1, atomId, { changes: childChange })];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), oneTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId, relevantNestedTree]);
		});
		it("relevant roots from nested changes under a tree being restored by pin", () => {
			const input: TestChangeset = [
				Mark.pin(1, brand(0), { cellId: atomId, changes: childChange }),
			];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), oneTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId, relevantNestedTree]);
		});
		it("relevant roots from nested changes under a tree being removed", () => {
			const input: TestChangeset = [Mark.delete(1, atomId, { changes: childChange })];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), oneTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [relevantNestedTree]);
		});
		it("relevant roots from nested changes under a tree being inserted", () => {
			const input: TestChangeset = [Mark.insert(1, atomId, { changes: childChange })];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), oneTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId, relevantNestedTree]);
		});
		it("relevant roots from nested changes under a tree being moved", () => {
			const input: TestChangeset = [
				Mark.moveOut(1, atomId, { changes: childChange }),
				Mark.moveIn(1, atomId),
			];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), oneTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [relevantNestedTree]);
		});
		it("relevant roots from nested changes under a tree being transiently inserted", () => {
			const input: TestChangeset = [
				Mark.attachAndDetach(Mark.insert(1, atomId), Mark.delete(1, atomId), {
					changes: childChange,
				}),
			];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), oneTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId, relevantNestedTree]);
		});
		it("relevant roots from nested changes under a tree being transiently restored", () => {
			const input: TestChangeset = [
				Mark.delete(1, brand(0), { cellId: atomId, changes: childChange }),
			];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), oneTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId, relevantNestedTree]);
		});
		it("relevant roots from nested changes under a tree being transiently inserted and moved out", () => {
			const input: TestChangeset = [
				Mark.attachAndDetach(Mark.insert(1, atomId), Mark.moveOut(1, atomId), {
					changes: childChange,
				}),
			];
			const actual = SF.relevantRemovedRoots(makeAnonChange(input), oneTreeDelegate);
			const array = Array.from(actual);
			assert.deepEqual(array, [deltaId, relevantNestedTree]);
		});
	});
	it("uses passed down revision", () => {
		const input: TestChangeset = [Mark.modify(childChange, { localId: brand(42) })];
		const actual = SF.relevantRemovedRoots(tagChange(input, tag), noTreeDelegate);
		const array = Array.from(actual);
		assert.deepEqual(array, [{ major: tag, minor: 42 }]);
	});
});
