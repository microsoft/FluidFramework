/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	Delta,
	FieldKey,
	FieldKindIdentifier,
	makeAnonChange,
	mintRevisionTag,
	RevisionTag,
	tagChange,
	tagRollbackInverse,
} from "../../core";
import { typeboxValidator } from "../../external-utilities";
import {
	DefaultEditBuilder,
	FieldKinds,
	FieldKindWithEditor,
	ModularChangeset,
	cursorForJsonableTreeNode,
} from "../../feature-libraries";

import { brand, IdAllocator, idAllocatorFromMaxId, Mutable } from "../../util";
import { testChangeReceiver } from "../utils";
// eslint-disable-next-line import/no-internal-modules
import { ModularChangeFamily } from "../../feature-libraries/modular-schema/modularChangeFamily";
import { leaf } from "../../domains";
// eslint-disable-next-line import/no-internal-modules
import { sequence } from "../../feature-libraries/default-field-kinds/defaultFieldKinds";
// eslint-disable-next-line import/no-internal-modules
import { MarkMaker } from "./sequence-field/testEdits";

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor> = new Map(
	[sequence].map((f) => [f.identifier, f]),
);

const family = new ModularChangeFamily(fieldKinds, { jsonValidator: typeboxValidator });

const fieldA: FieldKey = brand("FieldA");
const fieldB: FieldKey = brand("FieldB");
const fieldC: FieldKey = brand("FieldC");

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();

// Tests the integration of ModularChangeFamily with the default field kinds.
describe("ModularChangeFamily integration", () => {
	describe("rebase", () => {
		it("delete over cross-field move", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver);

			editor.enterTransaction();
			editor.move(
				{ parent: undefined, field: fieldA },
				1,
				2,
				{ parent: undefined, field: fieldB },
				2,
			);
			editor.exitTransaction();

			editor.enterTransaction();
			editor.sequenceField({ parent: undefined, field: fieldA }).delete(1, 1);
			editor.exitTransaction();

			editor.enterTransaction();
			editor.sequenceField({ parent: undefined, field: fieldB }).delete(2, 1);
			editor.exitTransaction();

			const [move, remove, expected] = getChanges();
			const rebased = family.rebase(remove, tagChange(move, mintRevisionTag()));
			const rebasedDelta = family.intoDelta(makeAnonChange(rebased));
			const expectedDelta = family.intoDelta(makeAnonChange(expected));
			assert.deepEqual(rebasedDelta, expectedDelta);
		});

		it("cross-field move over delete", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver);
			editor.sequenceField({ parent: undefined, field: fieldA }).delete(1, 1);
			editor.move(
				{ parent: undefined, field: fieldA },
				1,
				2,
				{ parent: undefined, field: fieldB },
				2,
			);
			editor.move(
				{ parent: undefined, field: fieldA },
				1,
				1,
				{ parent: undefined, field: fieldB },
				2,
			);
			const [remove, move, expected] = getChanges();
			const rebased = family.rebase(move, tagChange(remove, mintRevisionTag()));
			const rebasedDelta = normalizeDelta(family.intoDelta(makeAnonChange(rebased)));
			const expectedDelta = normalizeDelta(family.intoDelta(makeAnonChange(expected)));
			assert.deepEqual(rebasedDelta, expectedDelta);
		});
	});

	describe("compose", () => {
		it("cross-field move and nested changes", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver);
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);

			const newValue = "new value";
			const newNode = cursorForJsonableTreeNode({ type: leaf.number.name, value: newValue });
			editor
				.sequenceField({
					parent: { parent: undefined, parentField: fieldB, parentIndex: 0 },
					field: fieldC,
				})
				.insert(0, newNode);

			const [move, insert] = getChanges();
			const composed = family.compose([makeAnonChange(move), makeAnonChange(insert)]);
			const expected: Delta.Root = new Map([
				[
					fieldA,
					{
						local: [
							{
								count: 1,
								detach: { minor: 0 },
								fields: new Map([
									[
										fieldC,
										{
											build: [{ id: { minor: 1 }, trees: [newNode] }],
											local: [{ count: 1, attach: { minor: 1 } }],
										},
									],
								]),
							},
						],
					},
				],
				[
					fieldB,
					{
						local: [{ count: 1, attach: { minor: 0 } }],
					},
				],
			]);

			const delta = family.intoDelta(makeAnonChange(composed));
			assert.deepEqual(delta, expected);
		});

		it("cross-field move and inverse with nested changes", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver);
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);

			const newValue = "new value";
			const newNode = cursorForJsonableTreeNode({ type: leaf.number.name, value: newValue });
			editor
				.sequenceField({
					parent: { parent: undefined, parentField: fieldB, parentIndex: 0 },
					field: fieldC,
				})
				.insert(0, newNode);

			const [move, insert] = getChanges();
			const moveTagged = tagChange(move, tag1);
			const returnTagged = tagRollbackInverse(
				family.invert(moveTagged, true),
				tag3,
				moveTagged.revision,
			);

			const moveAndInsert = family.compose([tagChange(insert, tag2), moveTagged]);
			const composed = family.compose([returnTagged, makeAnonChange(moveAndInsert)]);
			const actual = family.intoDelta(makeAnonChange(composed));
			const expected: Delta.Root = new Map([
				[
					fieldB,
					{
						local: [
							{ count: 1 },
							{
								count: 1,
								fields: new Map([
									[
										fieldC,
										{
											build: [
												{ id: { major: tag2, minor: 1 }, trees: [newNode] },
											],
											local: [
												{ count: 1, attach: { major: tag2, minor: 1 } },
											],
										},
									],
								]),
							},
						],
					},
				],
			]);
			assert.deepEqual(actual, expected);
		});

		it("two cross-field moves of same node", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver);
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);
			editor.move(
				{ parent: undefined, field: fieldB },
				0,
				1,
				{ parent: undefined, field: fieldC },
				0,
			);
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldC },
				0,
			);

			const [move1, move2, expected] = getChanges();
			const composed = family.compose([makeAnonChange(move1), makeAnonChange(move2)]);
			const actualDelta = normalizeDelta(family.intoDelta(makeAnonChange(composed)));
			const expectedDelta = normalizeDelta(family.intoDelta(makeAnonChange(expected)));
			assert.deepEqual(actualDelta, expectedDelta);
		});
	});

	describe("toDelta", () => {
		it("works when nested changes come from different revisions", () => {
			const change: ModularChangeset = {
				fieldChanges: new Map([
					[
						brand("foo"),
						{
							fieldKind: FieldKinds.sequence.identifier,
							change: brand([
								MarkMaker.moveOut(1, brand(0)),
								MarkMaker.moveIn(1, brand(0)),
							]),
							revision: tag1,
						},
					],
					[
						brand("bar"),
						{
							fieldKind: FieldKinds.sequence.identifier,
							change: brand([
								MarkMaker.moveOut(2, brand(0)),
								MarkMaker.moveIn(2, brand(0)),
							]),
							revision: tag2,
						},
					],
				]),
			};
			const moveOut1: Delta.Mark = {
				detach: { major: tag1, minor: 0 },
				count: 1,
			};
			const moveIn1: Delta.Mark = {
				attach: { major: tag1, minor: 0 },
				count: 1,
			};
			const moveOut2: Delta.Mark = {
				detach: { major: tag2, minor: 0 },
				count: 2,
			};
			const moveIn2: Delta.Mark = {
				attach: { major: tag2, minor: 0 },
				count: 2,
			};
			const expected: Delta.Root = new Map([
				[brand("foo"), { local: [moveOut1, moveIn1] }],
				[brand("bar"), { local: [moveOut2, moveIn2] }],
			]);
			const actual = family.intoDelta(makeAnonChange(change));
			assert.deepEqual(actual, expected);
		});
	});
});

function normalizeDelta(
	delta: Delta.Root,
	idAllocator?: IdAllocator,
	idMap?: Map<number, number>,
): Delta.Root {
	const genId = idAllocator ?? idAllocatorFromMaxId();
	const map = idMap ?? new Map();

	const normalized = new Map();
	for (const [field, fieldChanges] of delta) {
		normalized.set(field, normalizeDeltaFieldChanges(fieldChanges, genId, map));
	}

	return normalized;
}

function normalizeDeltaFieldChanges(
	delta: Delta.FieldChanges,
	genId: IdAllocator,
	idMap: Map<number, number>,
): Delta.FieldChanges {
	const normalized: Mutable<Delta.FieldChanges> = {};
	if (delta.local !== undefined && delta.local.length > 0) {
		normalized.local = delta.local.map((mark) => normalizeDeltaMark(mark, genId, idMap));
	}
	if (delta.build !== undefined && delta.build.length > 0) {
		normalized.build = delta.build.map(({ id, trees }) => ({
			id: normalizeDeltaDetachedNodeId(id, genId, idMap),
			trees,
		}));
	}
	if (delta.global !== undefined && delta.global.length > 0) {
		normalized.global = delta.global.map(({ id, fields }) => ({
			id: normalizeDeltaDetachedNodeId(id, genId, idMap),
			fields: normalizeDelta(fields, genId, idMap),
		}));
	}
	if (delta.rename !== undefined && delta.rename.length > 0) {
		normalized.rename = delta.rename.map(({ oldId, count, newId }) => ({
			oldId: normalizeDeltaDetachedNodeId(oldId, genId, idMap),
			count,
			newId: normalizeDeltaDetachedNodeId(newId, genId, idMap),
		}));
	}

	return normalized;
}

function normalizeDeltaMark(
	delta: Delta.Mark,
	genId: IdAllocator,
	idMap: Map<number, number>,
): Delta.Mark {
	const normalized: Mutable<Delta.Mark> = { ...delta };
	if (normalized.attach !== undefined) {
		normalized.attach = normalizeDeltaDetachedNodeId(normalized.attach, genId, idMap);
	}
	if (normalized.detach !== undefined) {
		normalized.detach = normalizeDeltaDetachedNodeId(normalized.detach, genId, idMap);
	}
	if (normalized.fields !== undefined) {
		normalized.fields = normalizeDelta(normalized.fields, genId, idMap);
	}
	return normalized;
}

function normalizeDeltaDetachedNodeId(
	delta: Delta.DetachedNodeId,
	genId: IdAllocator,
	idMap: Map<number, number>,
): Delta.DetachedNodeId {
	assert(delta.major === undefined, "Normalize only supports minor detached node IDs");
	const minor = idMap.get(delta.minor) ?? genId.allocate();
	idMap.set(delta.minor, minor);
	return { minor };
}
