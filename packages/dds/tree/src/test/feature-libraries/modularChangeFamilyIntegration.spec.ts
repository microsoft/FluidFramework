/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	DeltaDetachedNodeId,
	DeltaFieldChanges,
	DeltaFieldMap,
	DeltaMark,
	DeltaRoot,
	FieldKey,
	FieldKindIdentifier,
	RevisionTag,
	TaggedChange,
	UpPath,
	makeAnonChange,
	revisionMetadataSourceFromInfo,
	tagChange,
	tagRollbackInverse,
} from "../../core/index.js";
import { leaf } from "../../domains/index.js";
// eslint-disable-next-line import/no-internal-modules
import { sequence } from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import {
	DefaultEditBuilder,
	FieldKindWithEditor,
	ModularChangeset,
	cursorForJsonableTreeNode,
	SequenceField as SF,
	EditDescription,
} from "../../feature-libraries/index.js";
import {
	ModularChangeFamily,
	intoDelta,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/modular-schema/modularChangeFamily.js";
import {
	IdAllocator,
	Mutable,
	brand,
	idAllocatorFromMaxId,
	nestedMapFromFlatList,
} from "../../util/index.js";
import {
	assertDeltaEqual,
	defaultRevisionMetadataFromChanges,
	failCodecFamily,
	mintRevisionTag,
	testChangeReceiver,
} from "../utils.js";

import {
	NodeChangeset,
	NodeId,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/modular-schema/modularChangeTypes.js";
// eslint-disable-next-line import/no-internal-modules
import { MarkMaker } from "./sequence-field/testEdits.js";

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor> = new Map([
	[sequence.identifier, sequence],
]);

const family = new ModularChangeFamily(fieldKinds, failCodecFamily);

const fieldA: FieldKey = brand("FieldA");
const fieldB: FieldKey = brand("FieldB");
const fieldC: FieldKey = brand("FieldC");

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();

// Tests the integration of ModularChangeFamily with the default field kinds.
describe("ModularChangeFamily integration", () => {
	describe("rebase", () => {
		it("remove over cross-field move", () => {
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
			editor.sequenceField({ parent: undefined, field: fieldA }).remove(1, 1);
			editor.exitTransaction();

			editor.enterTransaction();
			editor.sequenceField({ parent: undefined, field: fieldB }).remove(2, 1);
			editor.exitTransaction();

			const [move, remove, expected] = getChanges();
			const rebased = family.rebase(
				makeAnonChange(remove),
				tagChangeInline(move, tag1),
				revisionMetadataSourceFromInfo([{ revision: tag1 }]),
			);
			const rebasedDelta = intoDelta(makeAnonChange(rebased), family.fieldKinds);
			const expectedDelta = intoDelta(makeAnonChange(expected), family.fieldKinds);
			assert.deepEqual(rebasedDelta, expectedDelta);
		});

		it("cross-field move over remove", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver);
			editor.sequenceField({ parent: undefined, field: fieldA }).remove(1, 1);
			editor.move(
				{ parent: undefined, field: fieldA },
				1,
				2,
				{ parent: undefined, field: fieldB },
				2,
			);
			const [remove, move] = getChanges();
			const baseTag = mintRevisionTag();
			const restore = family.invert(tagChangeInline(remove, baseTag), false);
			const expected = family.compose([makeAnonChange(restore), makeAnonChange(move)]);
			const rebased = family.rebase(
				makeAnonChange(move),
				tagChangeInline(remove, baseTag),
				revisionMetadataSourceFromInfo([{ revision: baseTag }]),
			);
			const rebasedDelta = normalizeDelta(
				intoDelta(makeAnonChange(rebased), family.fieldKinds),
			);
			const expectedDelta = normalizeDelta(
				intoDelta(makeAnonChange(expected), family.fieldKinds),
			);
			assert.deepEqual(rebasedDelta, expectedDelta);
		});

		it("Nested moves both requiring a second pass", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver);

			const fieldAPath = { parent: undefined, field: fieldA };

			// Note that these are the paths before any edits have happened.
			const node1Path = { parent: undefined, parentField: fieldA, parentIndex: 1 };
			const node2Path = { parent: node1Path, parentField: fieldB, parentIndex: 1 };

			editor.enterTransaction();

			// Moves node2, which is a child of node1 to an earlier position in its field
			editor
				.sequenceField({
					parent: node1Path,
					field: fieldB,
				})
				.move(1, 1, 0);

			// Moves node1 to an earlier position in the field
			editor.sequenceField(fieldAPath).move(1, 1, 0);

			// Modifies node2 so that both fieldA and fieldB have changes that need to be transferred
			// from a move source to a destination during rebase.
			editor
				.sequenceField({
					parent: node2Path,
					field: fieldC,
				})
				.remove(0, 1);

			editor.exitTransaction();
			const [move1, move2, modify] = getChanges();
			const moves = family.compose([makeAnonChange(move1), makeAnonChange(move2)]);

			const taggedMoves = tagChangeInline(moves, tag1);
			const rebased = family.rebase(
				makeAnonChange(modify),
				taggedMoves,
				defaultRevisionMetadataFromChanges([taggedMoves]),
			);
			const fieldCExpected = [MarkMaker.remove(1, brand(5))];

			const nodeId2: NodeId = { localId: brand(6) };
			const node2Expected: NodeChangeset = {
				fieldChanges: new Map([
					[fieldC, { fieldKind: sequence.identifier, change: brand(fieldCExpected) }],
				]),
			};

			const fieldBExpected: SF.Changeset = [
				{ count: 1, changes: nodeId2 },
				// The two marks below are not essential and only exist because we're using tombstones
				{ count: 1 },
				{
					count: 1,
					cellId: { revision: tag1, localId: brand(0) },
				},
			];

			const nodeId1: NodeId = { localId: brand(7) };
			const node1Expected: NodeChangeset = {
				fieldChanges: new Map([
					[fieldB, { fieldKind: sequence.identifier, change: brand(fieldBExpected) }],
				]),
			};

			const fieldAExpected: SF.Changeset = [
				{ count: 1, changes: nodeId1 },
				// The two marks below a not essential and only exist because we're using tombstones
				{ count: 1 },
				{
					count: 1,
					cellId: { revision: tag1, localId: brand(3) },
				},
			];

			const expected: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[nodeId1.revision, nodeId1.localId, node1Expected],
					[nodeId2.revision, nodeId2.localId, node2Expected],
				]),
				fieldChanges: new Map([
					[fieldA, { fieldKind: sequence.identifier, change: brand(fieldAExpected) }],
				]),
				maxId: brand(7),
			};

			assert.deepEqual(rebased, expected);
		});

		it("over change which moves node upward", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver);
			const nodeAPath: UpPath = { parent: undefined, parentField: fieldA, parentIndex: 0 };
			const nodeBPath: UpPath = {
				parent: nodeAPath,
				parentField: fieldB,
				parentIndex: 0,
			};

			editor.move(
				{ parent: nodeAPath, field: fieldB },
				0,
				1,
				{ parent: undefined, field: fieldA },
				0,
			);

			const nodeBPathAfterMove: UpPath = {
				parent: undefined,
				parentField: fieldA,
				parentIndex: 0,
			};

			editor.sequenceField({ parent: nodeBPath, field: fieldC }).remove(0, 1);
			editor.sequenceField({ parent: nodeBPathAfterMove, field: fieldC }).remove(0, 1);

			const [move, remove, expected] = getChanges();
			const baseTag = mintRevisionTag();
			const rebased = family.rebase(
				makeAnonChange(remove),
				tagChangeInline(move, baseTag),
				revisionMetadataSourceFromInfo([{ revision: baseTag }]),
			);

			const rebasedDelta = normalizeDelta(
				intoDelta(makeAnonChange(rebased), family.fieldKinds),
			);
			const expectedDelta = normalizeDelta(
				intoDelta(makeAnonChange(expected), family.fieldKinds),
			);

			assertDeltaEqual(rebasedDelta, expectedDelta);
		});
	});

	describe("compose", () => {
		it("nested moves", () => {
			/**
			 * This test is intended to demonstrate the necessity of doing more than two compose passes through a field.
			 *
			 * Starting state [A, B, C]
			 * This test composes
			 * 1) a change which moves A to the right in the root field, moves B into A, and moves C into B.
			 * 2) a modification to C
			 *
			 */

			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver);
			const nodeAPath: UpPath = { parent: undefined, parentField: fieldA, parentIndex: 0 };

			// Moves A to an adjacent cell to its right
			editor.sequenceField({ parent: undefined, field: fieldA }).move(0, 1, 1);

			// Moves B into A
			editor.move(
				{ parent: undefined, field: fieldA },
				1,
				1,
				{ parent: nodeAPath, field: fieldB },
				0,
			);

			const nodeBPath: UpPath = { parent: nodeAPath, parentField: fieldB, parentIndex: 0 };

			// Moves C into B
			editor.move(
				{ parent: undefined, field: fieldA },
				1,
				1,
				{ parent: nodeBPath, field: fieldC },
				0,
			);

			const nodeCPath: UpPath = { parent: nodeBPath, parentField: fieldC, parentIndex: 0 };

			// Modifies C by removing a node from it
			editor.sequenceField({ parent: nodeCPath, field: fieldC }).remove(0, 1);

			const [moveA, moveB, moveC, removeD] = getChanges();

			const moves = makeAnonChange(
				family.compose([
					makeAnonChange(moveA),
					makeAnonChange(moveB),
					makeAnonChange(moveC),
				]),
			);

			const remove = makeAnonChange(removeD);

			const composed = family.compose([moves, remove]);
			const composedDelta = normalizeDelta(intoDelta(makeAnonChange(composed), fieldKinds));

			const nodeAChanges: DeltaFieldMap = new Map([
				[fieldB, { local: [{ count: 1, attach: { minor: 1 } }] }],
			]);

			const nodeBChanges: DeltaFieldMap = new Map([
				[
					fieldC,
					{
						local: [{ count: 1, attach: { minor: 2 } }],
					},
				],
			]);

			const nodeCChanges: DeltaFieldMap = new Map([
				[fieldC, { local: [{ count: 1, detach: { minor: 3 } }] }],
			]);

			const fieldAChanges: DeltaFieldChanges = {
				local: [
					{ count: 1, detach: { minor: 0 }, fields: nodeAChanges },
					{ count: 1, attach: { minor: 0 } },
					{ count: 1, detach: { minor: 1 }, fields: nodeBChanges },
					{ count: 1, detach: { minor: 2 }, fields: nodeCChanges },
				],
			};

			const expectedDelta: DeltaRoot = normalizeDelta({
				fields: new Map([[fieldA, fieldAChanges]]),
			});

			assertDeltaEqual(composedDelta, expectedDelta);
		});

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
			const expected: DeltaRoot = {
				build: [{ id: { minor: 2 }, trees: [newNode] }],
				fields: new Map([
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
												local: [{ count: 1, attach: { minor: 2 } }],
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
				]),
			};

			const delta = intoDelta(makeAnonChange(composed), family.fieldKinds);
			assertDeltaEqual(delta, expected);
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
			const moveTagged = tagChangeInline(move, tag1);
			const returnTagged = tagRollbackInverse(
				family.changeRevision(family.invert(moveTagged, true), tag3, moveTagged.revision),
				tag3,
				moveTagged.revision,
			);

			const moveAndInsert = family.compose([tagChangeInline(insert, tag2), moveTagged]);
			const composed = family.compose([returnTagged, makeAnonChange(moveAndInsert)]);
			const actual = intoDelta(makeAnonChange(composed), family.fieldKinds);
			const expected: DeltaRoot = {
				build: [
					{
						id: { major: tag2, minor: 2 },
						trees: [newNode],
					},
				],
				fields: new Map([
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
												local: [
													{ count: 1, attach: { major: tag2, minor: 2 } },
												],
											},
										],
									]),
								},
							],
						},
					],
				]),
			};

			assertDeltaEqual(actual, expected);
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
			const actualDelta = normalizeDelta(
				intoDelta(makeAnonChange(composed), family.fieldKinds),
			);
			const expectedDelta = normalizeDelta(
				intoDelta(makeAnonChange(expected), family.fieldKinds),
			);
			assert.deepEqual(actualDelta, expectedDelta);
		});

		it("prunes its output", () => {
			const a = buildChangeset([
				{
					type: "field",
					field: {
						parent: undefined,
						field: brand("foo"),
					},
					fieldKind: sequence.identifier,
					change: brand([]),
				},
			]);

			const b = buildChangeset([
				{
					type: "field",
					field: {
						parent: undefined,
						field: brand("bar"),
					},
					fieldKind: sequence.identifier,
					change: brand([]),
				},
			]);

			const composed = family.compose([makeAnonChange(a), makeAnonChange(b)]);
			assert.deepEqual(composed, ModularChangeFamily.emptyChange);
		});
	});

	describe("invert", () => {
		it("Nested moves both requiring a second pass", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver);

			const fieldAPath = { parent: undefined, field: fieldA };
			editor.enterTransaction();

			// Moves node1 to an earlier position in the field
			editor.sequenceField(fieldAPath).move(1, 1, 0);
			const node1Path = { parent: undefined, parentField: fieldA, parentIndex: 0 };
			const node2Path = { parent: node1Path, parentField: fieldB, parentIndex: 0 };

			// Moves node2, which is a child of node1 to an earlier position in its field
			editor
				.sequenceField({
					parent: node1Path,
					field: fieldB,
				})
				.move(1, 1, 0);

			// Modifies node2 so that both fieldA and fieldB have changes that need to be transfered
			// from a move source to a destination during invert.
			editor
				.sequenceField({
					parent: node2Path,
					field: fieldC,
				})
				.remove(0, 1);

			editor.exitTransaction();
			const [move1, move2, modify] = getChanges();
			const moves = family.compose([
				makeAnonChange(move1),
				makeAnonChange(move2),
				makeAnonChange(modify),
			]);

			const inverse = family.invert(tagChangeInline(moves, tag1), false);
			const fieldCExpected = [MarkMaker.revive(1, { revision: tag1, localId: brand(5) })];

			const nodeId2: NodeId = { revision: tag1, localId: brand(6) };
			const node2Expected: NodeChangeset = {
				fieldChanges: new Map([
					[fieldC, { fieldKind: sequence.identifier, change: brand(fieldCExpected) }],
				]),
			};

			const fieldBExpected = [
				MarkMaker.moveOut(1, brand(2), {
					changes: nodeId2,
					idOverride: { revision: tag1, localId: brand(3) },
				}),
				{ count: 1 },
				MarkMaker.returnTo(1, brand(2), { revision: tag1, localId: brand(2) }),
			];

			const nodeId1: NodeId = { revision: tag1, localId: brand(4) };
			const node1Expected: NodeChangeset = {
				fieldChanges: new Map([
					[fieldB, { fieldKind: sequence.identifier, change: brand(fieldBExpected) }],
				]),
			};

			const fieldAExpected = [
				MarkMaker.moveOut(1, brand(0), {
					changes: nodeId1,
					idOverride: { revision: tag1, localId: brand(1) },
				}),
				{ count: 1 },
				MarkMaker.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
			];

			const expected: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[nodeId1.revision, nodeId1.localId, node1Expected],
					[nodeId2.revision, nodeId2.localId, node2Expected],
				]),
				fieldChanges: new Map([
					[fieldA, { fieldKind: sequence.identifier, change: brand(fieldAExpected) }],
				]),
				maxId: brand(7),
			};

			assert.deepEqual(inverse, expected);
		});
	});

	describe("toDelta", () => {
		it("works when nested changes come from different revisions", () => {
			const change = buildChangeset([
				{
					type: "field",
					field: {
						parent: undefined,
						field: brand("foo"),
					},
					fieldKind: sequence.identifier,
					change: brand([
						MarkMaker.moveOut(1, { revision: tag1, localId: brand(0) }),
						MarkMaker.moveIn(1, { revision: tag1, localId: brand(0) }),
					]),
				},
				{
					type: "field",
					field: {
						parent: undefined,
						field: brand("bar"),
					},
					fieldKind: sequence.identifier,
					change: brand([
						MarkMaker.moveOut(2, { revision: tag2, localId: brand(0) }),
						MarkMaker.moveIn(2, { revision: tag2, localId: brand(0) }),
					]),
				},
			]);

			const moveOut1: DeltaMark = {
				detach: { major: tag1, minor: 0 },
				count: 1,
			};
			const moveIn1: DeltaMark = {
				attach: { major: tag1, minor: 0 },
				count: 1,
			};
			const moveOut2: DeltaMark = {
				detach: { major: tag2, minor: 0 },
				count: 2,
			};
			const moveIn2: DeltaMark = {
				attach: { major: tag2, minor: 0 },
				count: 2,
			};
			const expected: DeltaRoot = {
				fields: new Map([
					[brand("foo"), { local: [moveOut1, moveIn1] }],
					[brand("bar"), { local: [moveOut2, moveIn2] }],
				]),
			};
			const actual = intoDelta(makeAnonChange(change), family.fieldKinds);
			assert.deepEqual(actual, expected);
		});
	});
});

function normalizeDelta(
	delta: DeltaRoot,
	idAllocator?: IdAllocator,
	idMap?: Map<number, number>,
): DeltaRoot {
	const genId = idAllocator ?? idAllocatorFromMaxId();
	const map = idMap ?? new Map();

	const normalized: Mutable<DeltaRoot> = {};
	if (delta.fields !== undefined) {
		normalized.fields = normalizeDeltaFieldMap(delta.fields, genId, map);
	}
	if (delta.build !== undefined && delta.build.length > 0) {
		normalized.build = delta.build.map(({ id, trees }) => ({
			id: normalizeDeltaDetachedNodeId(id, genId, map),
			trees,
		}));
	}

	return normalized;
}

function normalizeDeltaFieldMap(
	delta: DeltaFieldMap,
	genId: IdAllocator,
	idMap: Map<number, number>,
): DeltaFieldMap {
	const normalized = new Map();
	for (const [field, fieldChanges] of delta) {
		normalized.set(field, normalizeDeltaFieldChanges(fieldChanges, genId, idMap));
	}
	return normalized;
}

function normalizeDeltaFieldChanges(
	delta: DeltaFieldChanges,
	genId: IdAllocator,
	idMap: Map<number, number>,
): DeltaFieldChanges {
	const normalized: Mutable<DeltaFieldChanges> = {};
	if (delta.local !== undefined && delta.local.length > 0) {
		normalized.local = delta.local.map((mark) => normalizeDeltaMark(mark, genId, idMap));
	}
	if (delta.global !== undefined && delta.global.length > 0) {
		normalized.global = delta.global.map(({ id, fields }) => ({
			id: normalizeDeltaDetachedNodeId(id, genId, idMap),
			fields: normalizeDeltaFieldMap(fields, genId, idMap),
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
	delta: DeltaMark,
	genId: IdAllocator,
	idMap: Map<number, number>,
): DeltaMark {
	const normalized: Mutable<DeltaMark> = { ...delta };
	if (normalized.attach !== undefined) {
		normalized.attach = normalizeDeltaDetachedNodeId(normalized.attach, genId, idMap);
	}
	if (normalized.detach !== undefined) {
		normalized.detach = normalizeDeltaDetachedNodeId(normalized.detach, genId, idMap);
	}
	if (normalized.fields !== undefined) {
		normalized.fields = normalizeDeltaFieldMap(normalized.fields, genId, idMap);
	}
	return normalized;
}

function normalizeDeltaDetachedNodeId(
	delta: DeltaDetachedNodeId,
	genId: IdAllocator,
	idMap: Map<number, number>,
): DeltaDetachedNodeId {
	if (delta.major !== undefined) {
		return delta;
	}
	const minor = idMap.get(delta.minor) ?? genId.allocate();
	idMap.set(delta.minor, minor);
	return { minor };
}

function tagChangeInline(
	change: ModularChangeset,
	revision: RevisionTag,
): TaggedChange<ModularChangeset> {
	return tagChange(family.changeRevision(change, revision), revision);
}

function buildChangeset(edits: EditDescription[]): ModularChangeset {
	const editor = family.buildEditor(() => undefined);
	return editor.buildChanges(edits);
}
