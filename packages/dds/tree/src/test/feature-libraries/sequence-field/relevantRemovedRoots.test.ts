/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { ChangeAtomId, DeltaDetachedNodeId } from "../../../core/index.js";
import { type NodeId, SequenceField as SF } from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import { TestNodeId } from "../../testNodeId.js";
import { MarkMaker as Mark } from "./testEdits.js";
import { mintRevisionTag } from "../../utils.js";

const tag = mintRevisionTag();
const atomId: ChangeAtomId = { localId: brand(0) };
const deltaId: DeltaDetachedNodeId = { minor: atomId.localId };
const childChange = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
const relevantNestedTree = { minor: 4242 };
const oneTreeDelegate = (child: NodeId) => {
	assert.deepEqual(child, childChange);
	return [relevantNestedTree];
};
const noTreeDelegate = (child: NodeId) => {
	assert.deepEqual(child, childChange);
	return [];
};

export function testRelevantRemovedRoots() {
	describe("relevantRemovedRoots", () => {
		describe("does not include", () => {
			it("a tree that remains in-doc", () => {
				const input: SF.Changeset = [{ count: 1 }];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, []);
			});
			it("a tree with child changes that remains in-doc", () => {
				const input: SF.Changeset = [Mark.modify(childChange)];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, []);
			});
			it("a tree that remains removed", () => {
				const input: SF.Changeset = [{ count: 1, cellId: atomId }];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, []);
			});
			it("a tree being removed", () => {
				const input: SF.Changeset = [Mark.remove(1, atomId)];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, []);
			});
			it("a tree with child changes being removed", () => {
				const input: SF.Changeset = [Mark.remove(1, atomId, { changes: childChange })];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, []);
			});
			it("a tree being moved", () => {
				const input: SF.Changeset = [Mark.moveOut(1, atomId), Mark.moveIn(1, atomId)];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, []);
			});
			it("a tree with child changes being moved", () => {
				const input: SF.Changeset = [
					Mark.moveOut(1, atomId, { changes: childChange }),
					Mark.moveIn(1, atomId),
				];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, []);
			});
			it("a live tree being pinned", () => {
				const input: SF.Changeset = [Mark.pin(1, brand(0))];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, []);
			});
		});
		describe("does include", () => {
			it("a tree being inserted", () => {
				const input: SF.Changeset = [Mark.insert(1, atomId)];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId]);
			});
			it("a tree being transiently inserted", () => {
				const input: SF.Changeset = [Mark.remove(1, atomId, { cellId: atomId })];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId]);
			});
			it("a tree being transiently inserted and moved out", () => {
				const input: SF.Changeset = [Mark.moveOut(1, atomId, { cellId: atomId })];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId]);
			});
			it("relevant roots from nested changes under a tree that remains in-doc", () => {
				const input: SF.Changeset = [Mark.modify(childChange)];
				const actual = SF.relevantRemovedRoots(input, oneTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [relevantNestedTree]);
			});
			it("relevant roots from nested changes under a tree that remains removed", () => {
				const input: SF.Changeset = [Mark.modify(childChange, atomId)];
				const actual = SF.relevantRemovedRoots(input, oneTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId, relevantNestedTree]);
			});
			it("a removed tree with nested changes", () => {
				const input: SF.Changeset = [Mark.modify(childChange, atomId)];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId]);
			});
			it("a tree being restored by revive", () => {
				const input: SF.Changeset = [Mark.revive(1, atomId)];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId]);
			});
			it("a tree being restored by pin", () => {
				const input: SF.Changeset = [Mark.pin(1, brand(0), { cellId: atomId })];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId]);
			});
			it("a tree being transiently restored", () => {
				const input: SF.Changeset = [Mark.remove(1, brand(0), { cellId: atomId })];
				const actual = SF.relevantRemovedRoots(input, noTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId]);
			});
			it("relevant roots from nested changes under a tree being restored by revive", () => {
				const input: SF.Changeset = [Mark.revive(1, atomId, { changes: childChange })];
				const actual = SF.relevantRemovedRoots(input, oneTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId, relevantNestedTree]);
			});
			it("relevant roots from nested changes under a tree being restored by pin", () => {
				const input: SF.Changeset = [
					Mark.pin(1, brand(0), { cellId: atomId, changes: childChange }),
				];
				const actual = SF.relevantRemovedRoots(input, oneTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId, relevantNestedTree]);
			});
			it("relevant roots from nested changes under a tree being removed", () => {
				const input: SF.Changeset = [Mark.remove(1, atomId, { changes: childChange })];
				const actual = SF.relevantRemovedRoots(input, oneTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [relevantNestedTree]);
			});
			it("relevant roots from nested changes under a tree being inserted", () => {
				const input: SF.Changeset = [Mark.insert(1, atomId, { changes: childChange })];
				const actual = SF.relevantRemovedRoots(input, oneTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId, relevantNestedTree]);
			});
			it("relevant roots from nested changes under a tree being moved", () => {
				const input: SF.Changeset = [
					Mark.moveOut(1, atomId, { changes: childChange }),
					Mark.moveIn(1, atomId),
				];
				const actual = SF.relevantRemovedRoots(input, oneTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [relevantNestedTree]);
			});
			it("relevant roots from nested changes under a tree being transiently inserted", () => {
				const input: SF.Changeset = [
					Mark.remove(1, atomId, { cellId: atomId, changes: childChange }),
				];
				const actual = SF.relevantRemovedRoots(input, oneTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId, relevantNestedTree]);
			});
			it("relevant roots from nested changes under a tree being transiently restored", () => {
				const input: SF.Changeset = [
					Mark.remove(1, brand(0), { cellId: atomId, changes: childChange }),
				];
				const actual = SF.relevantRemovedRoots(input, oneTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId, relevantNestedTree]);
			});
			it("relevant roots from nested changes under a tree being transiently inserted and moved out", () => {
				const input: SF.Changeset = [
					Mark.moveOut(1, atomId, { cellId: atomId, changes: childChange }),
				];
				const actual = SF.relevantRemovedRoots(input, oneTreeDelegate);
				const array = Array.from(actual);
				assert.deepEqual(array, [deltaId, relevantNestedTree]);
			});
		});
	});
}
