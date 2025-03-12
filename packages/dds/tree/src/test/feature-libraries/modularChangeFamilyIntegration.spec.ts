/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type DeltaDetachedNodeId,
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaMark,
	type DeltaRoot,
	type FieldKey,
	type FieldKindIdentifier,
	type RevisionTag,
	type TaggedChange,
	type UpPath,
	makeAnonChange,
	revisionMetadataSourceFromInfo,
	tagChange,
	tagRollbackInverse,
} from "../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { sequence } from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import {
	DefaultEditBuilder,
	type FieldKindWithEditor,
	type ModularChangeset,
	type SequenceField as SF,
	type EditDescription,
	genericFieldKind,
} from "../../feature-libraries/index.js";
import {
	ModularChangeFamily,
	intoDelta,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/modular-schema/modularChangeFamily.js";
import {
	type IdAllocator,
	type Mutable,
	brand,
	idAllocatorFromMaxId,
} from "../../util/index.js";
import {
	assertDeltaEqual,
	chunkFromJsonTrees,
	defaultRevisionMetadataFromChanges,
	failCodecFamily,
	mintRevisionTag,
	moveWithin,
	testChangeReceiver,
} from "../utils.js";

import type {
	NodeId,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/modular-schema/modularChangeTypes.js";
// eslint-disable-next-line import/no-internal-modules
import { MarkMaker } from "./sequence-field/testEdits.js";
// eslint-disable-next-line import/no-internal-modules
import { assertEqual, Change, removeAliases } from "./modular-schema/modularChangesetUtil.js";
// eslint-disable-next-line import/no-internal-modules
import { newGenericChangeset } from "../../feature-libraries/modular-schema/genericFieldKindTypes.js";

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor> = new Map([
	[sequence.identifier, sequence],
]);

const family = new ModularChangeFamily(fieldKinds, failCodecFamily);

const rootField: FieldKey = brand("Root");
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
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);

			const rootPath = { parent: undefined, parentField: rootField, parentIndex: 0 };
			editor.move(
				{
					parent: rootPath,
					field: fieldA,
				},
				1,
				2,
				{ parent: { parent: rootPath, parentField: fieldB, parentIndex: 0 }, field: fieldC },
				2,
			);

			editor.sequenceField({ parent: rootPath, field: fieldA }).remove(1, 1);

			const [move, remove] = getChanges();
			const rebased = family.rebase(
				makeAnonChange(remove),
				tagChangeInline(move, tag1),
				revisionMetadataSourceFromInfo([{ revision: tag1 }]),
			);

			const expected = Change.build(
				{ family, maxId: 8 },
				Change.field(
					rootField,
					genericFieldKind.identifier,
					newGenericChangeset(),
					Change.nodeWithId(
						0,
						{ localId: brand(8) },
						Change.field(
							fieldB,
							genericFieldKind.identifier,
							newGenericChangeset(),
							Change.nodeWithId(
								0,
								{ revision: tag1, localId: brand(5) },
								Change.field(fieldC, sequence.identifier, [
									MarkMaker.skip(2),
									MarkMaker.remove(1, brand(7)),
								]),
							),
						),
					),
				),
			);

			// Tag changes before comparing them because default edit builder will assign tags to changes and
			// the expected tag needs to be the same.
			const tag = mintRevisionTag();
			assertEqual(tagChangeInline(rebased, tag), tagChangeInline(expected, tag));
		});

		it("remove over cross-field move to edited field", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);

			const rootPath = { parent: undefined, parentField: rootField, parentIndex: 0 };
			editor.move(
				{
					parent: rootPath,
					field: fieldA,
				},
				1,
				2,
				{ parent: { parent: rootPath, parentField: fieldA, parentIndex: 0 }, field: fieldC },
				2,
			);

			editor.sequenceField({ parent: rootPath, field: fieldA }).remove(1, 1);

			const [move, remove] = getChanges();
			const rebased = family.rebase(
				makeAnonChange(remove),
				tagChangeInline(move, tag1),
				revisionMetadataSourceFromInfo([{ revision: tag1 }]),
			);

			const nodeId: NodeId = { revision: tag1, localId: brand(5) };
			const expected = Change.build(
				{ family, maxId: 8 },
				Change.field(
					rootField,
					genericFieldKind.identifier,
					newGenericChangeset(),
					Change.nodeWithId(
						0,
						{ localId: brand(8) },
						Change.field(
							fieldA,
							sequence.identifier,
							[MarkMaker.modify(nodeId), MarkMaker.tomb(tag1, brand(0), 2)],
							Change.nodeWithId(
								0,
								nodeId,
								Change.field(fieldC, sequence.identifier, [
									MarkMaker.skip(2),
									MarkMaker.remove(1, brand(7)),
								]),
							),
						),
					),
				),
			);

			const tag = mintRevisionTag();
			assertEqual(tagChangeInline(rebased, tag), tagChangeInline(expected, tag));
		});

		it("nested change over cross-field move", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);

			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);

			editor
				.sequenceField({
					parent: { parent: undefined, parentField: fieldA, parentIndex: 0 },
					field: fieldC,
				})
				.remove(0, 1);

			const [move, remove] = getChanges();
			const rebased = family.rebase(
				makeAnonChange(remove),
				tagChangeInline(move, tag1),
				revisionMetadataSourceFromInfo([{ revision: tag1 }]),
			);

			const expected = Change.build(
				{ family, maxId: 3 },
				Change.field(
					fieldB,
					sequence.identifier,
					[],
					Change.nodeWithId(
						0,
						{ localId: brand(3) },
						Change.field(fieldC, sequence.identifier, [MarkMaker.remove(1, brand(2))]),
					),
				),
			);

			const tag = mintRevisionTag();
			assertEqual(tagChangeInline(rebased, tag), tagChangeInline(expected, tag));
		});

		it("cross-field move over remove", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);
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
			const restore = family.invert(
				tagChangeInline(remove, baseTag),
				false,
				mintRevisionTag(),
			);
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
			assertEqual(rebasedDelta, expectedDelta);
		});

		it("move over cross-field move", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);

			moveWithin(editor, { parent: undefined, field: fieldA }, 0, 2, 2);
			const [move1, move2] = getChanges();
			const rebased = family.rebase(
				makeAnonChange(move2),
				tagChangeInline(move1, tag1),
				revisionMetadataSourceFromInfo([{ revision: tag1 }]),
			);

			const expected = Change.build(
				{ family, maxId: 5 },
				Change.field(fieldA, sequence.identifier, [
					MarkMaker.tomb(tag1, brand(0)),
					MarkMaker.moveOut(1, brand(3)),
					MarkMaker.moveIn(2, brand(2)),
				]),
				Change.field(fieldB, sequence.identifier, [MarkMaker.moveOut(1, brand(2))]),
			);

			const tag = mintRevisionTag();
			assertEqual(tagChangeInline(rebased, tag), tagChangeInline(expected, tag));
		});

		it("Nested moves both requiring a second pass", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);

			const fieldAPath = { parent: undefined, field: fieldA };

			// Note that these are the paths before any edits have happened.
			const node1Path = { parent: undefined, parentField: fieldA, parentIndex: 1 };
			const node2Path = { parent: node1Path, parentField: fieldB, parentIndex: 1 };

			editor.enterTransaction();

			// Moves node2, which is a child of node1 to an earlier position in its field
			moveWithin(editor, { parent: node1Path, field: fieldB }, 1, 1, 0);

			// Moves node1 to an earlier position in the field
			moveWithin(editor, fieldAPath, 1, 1, 0);

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

			const fieldAExpected: SF.Changeset = [
				{ count: 2 },
				{
					count: 1,
					cellId: { revision: tag1, localId: brand(3) },
				},
			];

			const fieldBExpected: SF.Changeset = [
				{ count: 2 },
				{
					count: 1,
					cellId: { revision: tag1, localId: brand(0) },
				},
			];

			const fieldCExpected = [MarkMaker.remove(1, brand(5))];

			const nodeId1: NodeId = { localId: brand(7) };
			const nodeId2: NodeId = { localId: brand(6) };

			const expected = Change.build(
				{ family, maxId: 7 },
				Change.field(
					fieldA,
					sequence.identifier,
					fieldAExpected,
					Change.nodeWithId(
						0,
						nodeId1,
						Change.field(
							fieldB,
							sequence.identifier,
							fieldBExpected,
							Change.nodeWithId(
								0,
								nodeId2,
								Change.field(fieldC, sequence.identifier, fieldCExpected),
							),
						),
					),
				),
			);

			const tag = mintRevisionTag();
			assertEqual(tagChangeInline(rebased, tag), tagChangeInline(expected, tag));
		});

		it("over change which moves node upward", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);
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

			const rebasedTag = mintRevisionTag();
			const rebasedDelta = normalizeDelta(
				intoDelta(tagChangeInline(rebased, rebasedTag), family.fieldKinds),
			);
			const expectedDelta = normalizeDelta(
				intoDelta(tagChangeInline(expected, rebasedTag), family.fieldKinds),
			);

			assertDeltaEqual(rebasedDelta, expectedDelta);
		});

		// This test demonstrates that a field may need three rebasing passes.
		it("over change which moves into moved subtree", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);
			const nodePath1: UpPath = { parent: undefined, parentField: fieldA, parentIndex: 1 };

			// The base changeset consists of the following two move edits.
			// This edit moves node2 from field B into field C which is under node1 in field A.
			editor.move(
				{ parent: undefined, field: fieldB },
				0,
				1,
				{ parent: nodePath1, field: fieldC },
				0,
			);

			// This edit moves node1 in field A to the beginning of the field.
			const fieldAPath = { parent: undefined, field: fieldA };
			moveWithin(editor, fieldAPath, 1, 1, 0);

			// The changeset to be rebased consists of the following two edits.
			// This is an arbitrary edit to field A.
			editor.sequenceField(fieldAPath).remove(2, 1);

			// This is an edit which targets node2.
			editor.sequenceField({ parent: undefined, field: fieldB }).remove(0, 1);

			const [base1, base2, new1, new2] = getChanges();
			const baseChangeset = tagChangeInline(
				family.compose([makeAnonChange(base1), makeAnonChange(base2)]),
				tag1,
			);

			const newChangeset = makeAnonChange(
				family.compose([makeAnonChange(new1), makeAnonChange(new2)]),
			);

			const rebased = family.rebase(
				newChangeset,
				baseChangeset,
				revisionMetadataSourceFromInfo([{ revision: tag1 }]),
			);

			const expected = Change.build(
				{ family, maxId: 6 },
				Change.field(
					fieldA,
					sequence.identifier,
					[MarkMaker.skip(2), MarkMaker.tomb(tag1, brand(3)), MarkMaker.remove(1, brand(5))],
					Change.nodeWithId(
						0,
						{ revision: tag1, localId: brand(2) },
						Change.field(fieldC, sequence.identifier, [MarkMaker.remove(1, brand(6))]),
					),
				),
			);

			const tag = mintRevisionTag();
			assertEqual(tagChangeInline(rebased, tag), tagChangeInline(expected, tag));
		});

		it("prunes its output", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);
			const nodeAPath: UpPath = { parent: undefined, parentField: fieldA, parentIndex: 0 };
			const nodeBPath: UpPath = { parent: undefined, parentField: fieldB, parentIndex: 0 };

			editor.sequenceField({ parent: nodeAPath, field: fieldA }).remove(0, 1);
			editor.sequenceField({ parent: nodeBPath, field: fieldB }).remove(0, 1);

			const [editA, editB] = getChanges();
			const baseTag = mintRevisionTag();
			const rebased = family.rebase(
				makeAnonChange(editB),
				tagChangeInline(editA, baseTag),
				revisionMetadataSourceFromInfo([{ revision: baseTag }]),
			);

			assertEqual(rebased, editB);
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
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);
			const nodeAPath: UpPath = { parent: undefined, parentField: fieldA, parentIndex: 0 };

			// Moves A to an adjacent cell to its right
			const fieldAPath = { parent: undefined, field: fieldA };
			moveWithin(editor, fieldAPath, 0, 1, 1);

			// Moves B into A
			editor.move(fieldAPath, 1, 1, { parent: nodeAPath, field: fieldB }, 0);

			const nodeBPath: UpPath = { parent: nodeAPath, parentField: fieldB, parentIndex: 0 };

			// Moves C into B
			editor.move(fieldAPath, 1, 1, { parent: nodeBPath, field: fieldC }, 0);

			const nodeCPath: UpPath = { parent: nodeBPath, parentField: fieldC, parentIndex: 0 };

			// Modifies C by removing a node from it
			editor.sequenceField({ parent: nodeCPath, field: fieldC }).remove(0, 1);

			const [moveA, moveB, moveC, removeD] = getChanges();

			const tagForCompare = mintRevisionTag();

			const moves = tagChangeInline(
				family.compose([makeAnonChange(moveA), makeAnonChange(moveB), makeAnonChange(moveC)]),
				tagForCompare,
			);

			const remove = tagChangeInline(removeD, tagForCompare);

			const composed = family.compose([moves, remove]);
			family.validateChangeset(composed);
			const composedDelta = normalizeDelta(intoDelta(makeAnonChange(composed), fieldKinds));

			const nodeAChanges: DeltaFieldMap = new Map([
				[fieldB, [{ count: 1, attach: { minor: 1, major: tagForCompare } }]],
			]);

			const nodeBChanges: DeltaFieldMap = new Map([
				[fieldC, [{ count: 1, attach: { minor: 2, major: tagForCompare } }]],
			]);

			const nodeCChanges: DeltaFieldMap = new Map([
				[fieldC, [{ count: 1, detach: { minor: 3, major: tagForCompare } }]],
			]);

			const fieldAChanges: DeltaFieldChanges = [
				{ count: 1, detach: { minor: 0, major: tagForCompare }, fields: nodeAChanges },
				{ count: 1, attach: { minor: 0, major: tagForCompare } },
				{ count: 1, detach: { minor: 1, major: tagForCompare }, fields: nodeBChanges },
				{ count: 1, detach: { minor: 2, major: tagForCompare }, fields: nodeCChanges },
			];

			const expectedDelta: DeltaRoot = normalizeDelta({
				fields: new Map([[fieldA, fieldAChanges]]),
			});

			assertDeltaEqual(composedDelta, expectedDelta);
		});

		it("cross-field move and nested changes", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);

			const newNode = chunkFromJsonTrees(["new value"]);
			editor
				.sequenceField({
					parent: { parent: undefined, parentField: fieldB, parentIndex: 0 },
					field: fieldC,
				})
				.insert(0, newNode);

			const [move, insert] = getChanges();
			const composed = family.compose([makeAnonChange(move), makeAnonChange(insert)]);
			const tagForCompare = mintRevisionTag();
			const taggedComposed = tagChangeInline(composed, tagForCompare);
			const expected: DeltaRoot = {
				build: [{ id: { minor: 2, major: tagForCompare }, trees: newNode }],
				fields: new Map([
					[
						fieldA,
						[
							{
								count: 1,
								detach: { minor: 0, major: tagForCompare },
								fields: new Map([
									[fieldC, [{ count: 1, attach: { minor: 2, major: tagForCompare } }]],
								]),
							},
						],
					],
					[fieldB, [{ count: 1, attach: { minor: 0, major: tagForCompare } }]],
				]),
			};

			family.validateChangeset(composed);
			const delta = intoDelta(taggedComposed, family.fieldKinds);
			assertDeltaEqual(delta, expected);
		});

		it("cross-field move and inverse with nested changes", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);

			const newNode = chunkFromJsonTrees(["new value"]);
			editor
				.sequenceField({
					parent: { parent: undefined, parentField: fieldB, parentIndex: 0 },
					field: fieldC,
				})
				.insert(0, newNode);

			const [move, insert] = getChanges();
			const moveTagged = tagChangeInline(move, tag1);
			const returnTagged = tagRollbackInverse(
				family.invert(moveTagged, true, tag3),
				tag3,
				moveTagged.revision,
			);

			const moveAndInsert = family.compose([tagChangeInline(insert, tag2), moveTagged]);
			const composed = family.compose([returnTagged, makeAnonChange(moveAndInsert)]);
			family.validateChangeset(composed);

			const actual = intoDelta(makeAnonChange(composed), family.fieldKinds);
			const expected: DeltaRoot = {
				build: [
					{
						id: { major: tag2, minor: 2 },
						trees: newNode,
					},
				],
				fields: new Map([
					[
						fieldB,
						[
							{ count: 1 },
							{
								count: 1,
								fields: new Map([[fieldC, [{ count: 1, attach: { major: tag2, minor: 2 } }]]]),
							},
						],
					],
				]),
			};

			assertDeltaEqual(actual, expected);
		});

		it("two cross-field moves of same node", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);
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
			const tagForCompare = mintRevisionTag();
			family.validateChangeset(composed);
			const actualDelta = normalizeDelta(
				intoDelta(tagChangeInline(composed, tagForCompare), family.fieldKinds),
			);
			const expectedDelta = normalizeDelta(
				intoDelta(tagChangeInline(expected, tagForCompare), family.fieldKinds),
			);
			assertEqual(actualDelta, expectedDelta);
		});
	});

	describe("invert", () => {
		it("Cross-field move of edited node", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);

			editor.enterTransaction();

			// Remove a node
			editor
				.sequenceField({
					parent: { parent: undefined, parentField: fieldA, parentIndex: 0 },
					field: fieldC,
				})
				.remove(0, 1);

			// Move the parent of the removed node to another field
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);
			editor.exitTransaction();

			const [remove, move] = getChanges();
			const edit = family.compose([makeAnonChange(remove), makeAnonChange(move)]);

			const inverse = removeAliases(family.invert(tagChangeInline(edit, tag1), false, tag2));

			const fieldAExpected = [
				MarkMaker.returnTo(1, brand(2), { revision: tag1, localId: brand(2) }),
			];
			const fieldBExpected = [
				MarkMaker.moveOut(1, brand(2), { changes: { revision: tag1, localId: brand(1) } }),
			];
			const fieldCExpected = [MarkMaker.revive(1, { revision: tag1, localId: brand(0) })];

			const expected = tagChangeInline(
				Change.build(
					{ family, maxId: 3 },
					Change.field(fieldA, sequence.identifier, fieldAExpected),
					Change.field(
						fieldB,
						sequence.identifier,
						fieldBExpected,
						Change.nodeWithId(
							0,
							{ revision: tag1, localId: brand(1) },
							Change.field(fieldC, sequence.identifier, fieldCExpected),
						),
					),
				),
				tag2,
			).change;

			assertEqual(inverse, expected);
		});

		it("Nested moves both requiring a second pass", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, mintRevisionTag, changeReceiver);

			const fieldAPath = { parent: undefined, field: fieldA };
			editor.enterTransaction();

			// Moves node1 to an earlier position in the field
			moveWithin(editor, fieldAPath, 1, 1, 0);
			const node1Path = { parent: undefined, parentField: fieldA, parentIndex: 0 };
			const node2Path = { parent: node1Path, parentField: fieldB, parentIndex: 0 };

			// Moves node2, which is a child of node1 to an earlier position in its field
			moveWithin(
				editor,
				{
					parent: node1Path,
					field: fieldB,
				},
				1,
				1,
				0,
			);

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

			const inverse = removeAliases(family.invert(tagChangeInline(moves, tag1), false, tag2));

			const fieldAExpected: SF.Changeset = [
				MarkMaker.moveOut(1, brand(0)),
				{ count: 1 },
				MarkMaker.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
			];

			const fieldBExpected = [
				MarkMaker.moveOut(1, brand(2)),
				{ count: 1 },
				MarkMaker.returnTo(1, brand(2), { revision: tag1, localId: brand(2) }),
			];

			const fieldCExpected = [MarkMaker.revive(1, { revision: tag1, localId: brand(5) })];

			const nodeId1: NodeId = { revision: tag1, localId: brand(4) };
			const nodeId2: NodeId = { revision: tag1, localId: brand(6) };

			const expected: ModularChangeset = tagChangeInline(
				Change.build(
					{ family, maxId: 7 },
					Change.field(
						fieldA,
						sequence.identifier,
						fieldAExpected,
						Change.nodeWithId(
							0,
							nodeId1,
							Change.field(
								fieldB,
								sequence.identifier,
								fieldBExpected,
								Change.nodeWithId(
									0,
									nodeId2,
									Change.field(fieldC, sequence.identifier, fieldCExpected),
								),
							),
						),
					),
				),
				tag2,
			).change;

			assertEqual(inverse, expected);
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
					revision: tag1,
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
					revision: tag1,
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
					[brand("foo"), [moveOut1, moveIn1]],
					[brand("bar"), [moveOut2, moveIn2]],
				]),
			};
			const actual = intoDelta(makeAnonChange(change), family.fieldKinds);
			assertEqual(actual, expected);
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
	if (delta.global !== undefined && delta.global.length > 0) {
		normalized.global = delta.global.map(({ id, fields }) => ({
			id: normalizeDeltaDetachedNodeId(id, genId, map),
			fields: normalizeDeltaFieldMap(fields, genId, map),
		}));
	}
	if (delta.rename !== undefined && delta.rename.length > 0) {
		normalized.rename = delta.rename.map(({ oldId, count, newId }) => ({
			oldId: normalizeDeltaDetachedNodeId(oldId, genId, map),
			count,
			newId: normalizeDeltaDetachedNodeId(newId, genId, map),
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
	if (delta.length > 0) {
		return delta.map((mark) => normalizeDeltaMark(mark, genId, idMap));
	}

	return delta;
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
	const minor = idMap.get(delta.minor) ?? genId.allocate();
	idMap.set(delta.minor, minor);
	return { minor, major: delta.major };
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
