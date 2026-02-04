/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";

import {
	type ChangeAtomId,
	type ChangeEncodingContext,
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaMark,
	type DeltaRoot,
	type FieldKey,
	type FieldKindIdentifier,
	type NormalizedUpPath,
	type RevisionTag,
	type TaggedChange,
	makeAnonChange,
	revisionMetadataSourceFromInfo,
	tagChange,
	tagRollbackInverse,
} from "../../core/index.js";
import {
	DefaultEditBuilder,
	type FlexFieldKind,
	type ModularChangeset,
	type EditDescription,
	genericFieldKind,
	type EncodedModularChangesetV1,
	makeModularChangeCodecFamily,
	makeFieldBatchCodec,
	DefaultRevisionReplacer,
	FieldKinds as defaultFieldKinds,
	fieldKindConfigurations,
} from "../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { newGenericChangeset } from "../../feature-libraries/modular-schema/genericFieldKindTypes.js";
import {
	ModularChangeFamily,
	intoDelta,
	validateChangeset,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../feature-libraries/modular-schema/modularChangeFamily.js";
import type {
	NodeId,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../feature-libraries/modular-schema/modularChangeTypes.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { Changeset } from "../../feature-libraries/sequence-field/types.js";
import { FluidClientVersion, FormatValidatorBasic } from "../../index.js";
import { brand } from "../../util/index.js";
import {
	assertDeltaEqual,
	chunkFromJsonTrees,
	defaultRevisionMetadataFromChanges,
	makeEncodingTestSuite,
	mintRevisionTag,
	moveWithin,
	testChangeReceiver,
	testIdCompressor,
	testRevisionTagCodec,
	type EncodingTestData,
} from "../utils.js";

import {
	assertEqual,
	assertModularChangesetsEqual,
	assertModularChangesetsEqualIgnoreRebaseVersion,
	Change,
	normalizeDelta,
	removeAliases,
	// eslint-disable-next-line import-x/no-internal-modules
} from "./modular-schema/modularChangesetUtil.js";
// eslint-disable-next-line import-x/no-internal-modules
import { MarkMaker } from "./sequence-field/testEdits.js";

const sequenceIdentifier = defaultFieldKinds.sequence.identifier;
const optionalIdentifier = defaultFieldKinds.optional.identifier;

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind> = new Map<
	FieldKindIdentifier,
	FlexFieldKind
>([
	[sequenceIdentifier, defaultFieldKinds.sequence],
	[optionalIdentifier, defaultFieldKinds.optional],
]);

const codecOptions = {
	jsonValidator: FormatValidatorBasic,
	minVersionForCollab: FluidClientVersion.v2_0,
};

const codec = makeModularChangeCodecFamily(
	fieldKindConfigurations,
	testRevisionTagCodec,
	makeFieldBatchCodec(codecOptions),
	codecOptions,
);
const family = new ModularChangeFamily(fieldKinds, codec, codecOptions);

const rootField: FieldKey = brand("Root");
const fieldA: FieldKey = brand("FieldA");
const fieldB: FieldKey = brand("FieldB");
const fieldC: FieldKey = brand("FieldC");
const fieldD: FieldKey = brand("FieldD");

const tag0: RevisionTag = mintRevisionTag();
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tag4: RevisionTag = mintRevisionTag();

const rootPath: NormalizedUpPath = {
	detachedNodeId: undefined,
	parent: undefined,
	parentField: rootField,
	parentIndex: 0,
};

const fieldARootPath: NormalizedUpPath = {
	detachedNodeId: undefined,
	parent: undefined,
	parentField: fieldA,
	parentIndex: 0,
};

const fieldBRootPath: NormalizedUpPath = {
	detachedNodeId: undefined,
	parent: undefined,
	parentField: fieldB,
	parentIndex: 0,
};

// Tests the integration of ModularChangeFamily with the default field kinds.
describe("ModularChangeFamily integration", () => {
	describe("rebase", () => {
		it("remove over cross-field move", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			editor.move(
				{ parent: rootPath, field: fieldA },
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
								Change.field(fieldC, sequenceIdentifier, [
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

		it("remove over move and remove", () => {
			// This change moves two nodes and removes the second one.
			const targetChange = Change.build(
				{
					family,
					maxId: 4,
					detachedMoves: [
						{
							detachId: { revision: tag1, localId: brand(4) },
							count: 1,
							newLocation: { nodeId: undefined, field: fieldA },
						},
					],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.remove(1, { revision: tag1, localId: brand(0) }),
					MarkMaker.remove(
						1,
						{ revision: tag1, localId: brand(4) },
						{ cellRename: { revision: tag1, localId: brand(1) } },
					),
					MarkMaker.insert(1, { revision: tag1, localId: brand(2) }, { id: brand(0) }),
					MarkMaker.rename(
						1,
						{ revision: tag1, localId: brand(3) },
						{ revision: tag1, localId: brand(4) },
					),
				]),
			);

			const sourceChange = Change.build(
				{ family, maxId: 1 },
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.remove(2, { revision: tag2, localId: brand(0) }),
				]),
			);

			const rebased = family.rebase(
				tagChange(sourceChange, tag2),
				tagChange(targetChange, tag1),
				revisionMetadataSourceFromInfo([{ revision: tag1 }, { revision: tag2 }]),
			);

			const expected = Change.build(
				{
					family,
					maxId: 4,
					renames: [
						{
							oldId: { revision: tag1, localId: brand(4) },
							newId: { revision: tag2, localId: brand(1) },
							count: 1,
							detachLocation: { nodeId: undefined, field: fieldA },
						},
					],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.tomb(tag1, brand(0), 2),
					MarkMaker.remove(1, { revision: tag2, localId: brand(0) }),
					MarkMaker.rename(
						1,
						{ revision: tag1, localId: brand(4) },
						{ revision: tag2, localId: brand(1) },
					),
				]),
			);

			assertEqual(rebased, expected);
		});

		it("remove over cross-field move to edited field", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

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
							sequenceIdentifier,
							[MarkMaker.modify(nodeId), MarkMaker.tomb(tag1, brand(0), 2)],
							Change.nodeWithId(
								0,
								nodeId,
								Change.field(fieldC, sequenceIdentifier, [
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
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);

			editor.sequenceField({ parent: fieldARootPath, field: fieldC }).remove(0, 1);

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
					sequenceIdentifier,
					[],
					Change.nodeWithId(
						0,
						{ localId: brand(3) },
						Change.field(fieldC, sequenceIdentifier, [MarkMaker.remove(1, brand(2))]),
					),
				),
			);

			const tag = mintRevisionTag();
			assertEqual(tagChangeInline(rebased, tag), tagChangeInline(expected, tag));
		});

		it("cross-field move over remove", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);
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
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);
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
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.tomb(tag1, brand(0)),
					MarkMaker.moveOut(1, brand(3)),
					MarkMaker.moveIn(2, brand(2)),
				]),
				Change.field(fieldB, sequenceIdentifier, [MarkMaker.moveOut(1, brand(2))]),
			);

			const tag = mintRevisionTag();
			assertEqual(tagChangeInline(rebased, tag), tagChangeInline(expected, tag));
		});

		it("Nested moves both requiring a second pass", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			const fieldAPath = { parent: undefined, field: fieldA };

			// Note that these are the paths before any edits have happened.
			const node1Path: NormalizedUpPath = {
				detachedNodeId: undefined,
				parent: undefined,
				parentField: fieldA,
				parentIndex: 1,
			};
			const node2Path: NormalizedUpPath = {
				parent: node1Path,
				parentField: fieldB,
				parentIndex: 1,
			};

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

			const fieldAExpected: Changeset = [
				{ count: 2 },
				{
					count: 1,
					cellId: { revision: tag1, localId: brand(3) },
				},
			];

			const fieldBExpected: Changeset = [
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
					sequenceIdentifier,
					fieldAExpected,
					Change.nodeWithId(
						0,
						nodeId1,
						Change.field(
							fieldB,
							sequenceIdentifier,
							fieldBExpected,
							Change.nodeWithId(
								0,
								nodeId2,
								Change.field(fieldC, sequenceIdentifier, fieldCExpected),
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
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);
			const nodeAPath = fieldARootPath;
			const nodeBPath: NormalizedUpPath = {
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

			const nodeBPathAfterMove = fieldARootPath;

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

		// This test demonstrates that a field may need more than two rebasing passes.
		// When rebasing a field we may find a move into a subtree which is not represented in the new changeset.
		// To add that subtree we may have to invalidate an ancestor field, and may then discover that the base changeset
		// moved that subtree to another unrepresented field.
		// Note that this only happens once in this test, but could happen an arbitrary number of times.
		it("over change which moves into moved subtree", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);
			const nodePath1: NormalizedUpPath = {
				detachedNodeId: undefined,
				parent: undefined,
				parentField: fieldA,
				parentIndex: 1,
			};

			// The base changeset consists of the following two move edits.
			// This edit moves node2 from field B into field C which is under node1 in field A.
			editor.move(
				{ parent: undefined, field: fieldB },
				0,
				1,
				{ parent: nodePath1, field: fieldC },
				0,
			);

			// This edit moves node1 in field A to field D under another node in field A
			const fieldAPath = { parent: undefined, field: fieldA };
			const nodePath0: NormalizedUpPath = {
				parent: undefined,
				parentField: fieldA,
				parentIndex: 0,
				detachedNodeId: undefined,
			};

			const fieldDPath = { parent: nodePath0, field: fieldD };
			editor.move(fieldAPath, 1, 1, fieldDPath, 0);

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
				{ family, maxId: 7 },
				Change.field(
					fieldA,
					sequenceIdentifier,
					[MarkMaker.skip(1), MarkMaker.tomb(tag1, brand(3)), MarkMaker.remove(1, brand(6))],
					Change.nodeWithId(
						0,
						{ revision: tag1, localId: brand(5) },
						Change.field(
							fieldD,
							sequenceIdentifier,
							[],
							Change.nodeWithId(
								0,
								{ revision: tag1, localId: brand(2) },
								Change.field(fieldC, sequenceIdentifier, [MarkMaker.remove(1, brand(7))]),
							),
						),
					),
				),
			);

			const tag = mintRevisionTag();
			assertEqual(tagChangeInline(rebased, tag), tagChangeInline(expected, tag));
		});

		it("change to detached root over attach of that node", () => {
			const nodeDescription = Change.nodeWithId(
				1,
				{ revision: tag2, localId: brand(0) },
				Change.field(fieldB, sequenceIdentifier, [
					MarkMaker.remove(1, { revision: tag2, localId: brand(1) }),
				]),
			);
			const sourceChange = Change.build({
				family,
				maxId: 2,
				roots: [
					{
						detachId: { revision: tag1, localId: brand(1) },
						change: nodeDescription,
					},
				],
			});

			const targetChange = Change.build(
				{
					family,
					maxId: 1,
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.insert(2, { revision: tag1, localId: brand(0) }),
				]),
			);

			const rebased = family.rebase(
				tagChange(sourceChange, tag2),
				tagChange(targetChange, tag1),
				revisionMetadataSourceFromInfo([{ revision: tag1 }, { revision: tag2 }]),
			);

			const expected = Change.build(
				{ family, maxId: 2 },
				Change.field(fieldA, sequenceIdentifier, [], nodeDescription),
			);

			assertEqual(rebased, expected);
		});

		it("rename over revive", () => {
			const origId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const rename = Change.build(
				{
					family,
					maxId: 1,
					renames: [
						{
							oldId: origId,
							newId: { revision: tag3, localId: brand(0) },
							count: 2,
							detachLocation: undefined,
						},
					],
					revisions: [{ revision: tag3 }],
				},
				Change.field(fieldA, sequenceIdentifier, [MarkMaker.tomb(tag1, brand(0), 2)]),
			);

			// This change renames both detached nodes, but only revives the first one.
			const revive = Change.build(
				{
					family,
					maxId: 0,
					renames: [
						{
							oldId: origId,
							newId: { revision: tag2, localId: brand(0) },
							count: 2,
							detachLocation: undefined,
						},
					],
					revisions: [{ revision: tag2 }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.revive(1, origId, { revision: tag2 }),
				]),
			);

			const rebased = family.rebase(
				tagChange(rename, tag3),
				tagChange(revive, tag2),
				revisionMetadataSourceFromInfo([{ revision: tag2 }, { revision: tag3 }]),
			);

			const expected = Change.build(
				{
					family,
					maxId: 1,
					renames: [
						{
							oldId: { revision: tag2, localId: brand(1) },
							newId: { revision: tag3, localId: brand(1) },
							count: 1,
							detachLocation: undefined,
						},
					],
					revisions: [{ revision: tag3 }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.remove(1, { revision: tag3, localId: brand(0) }),
					MarkMaker.tomb(tag1, brand(1), 1),
				]),
			);

			assertEqual(rebased, expected);
		});

		it("rename over move", () => {
			const fieldAId = { nodeId: undefined, field: fieldA };
			const origId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const newId: ChangeAtomId = { revision: tag3, localId: brand(0) };
			const rename = Change.build(
				{
					family,
					maxId: 1,
					renames: [
						{
							oldId: origId,
							newId,
							count: 1,
							detachLocation: fieldAId,
						},
					],
					revisions: [{ revision: tag3 }],
				},
				Change.field(fieldA, sequenceIdentifier, [MarkMaker.rename(1, origId, newId)]),
			);

			const moveId: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const move = Change.build(
				{
					family,
					maxId: 0,
					renames: [
						{
							oldId: origId,
							newId: moveId,
							count: 1,
							detachLocation: fieldAId,
						},
					],
					revisions: [{ revision: tag2 }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.rename(1, origId, moveId),
					MarkMaker.revive(
						1,
						{ revision: tag2, localId: brand(1) },
						{ revision: moveId.revision, id: moveId.localId },
					),
				]),
			);

			const rebased = family.rebase(
				tagChange(rename, tag3),
				tagChange(move, tag2),
				revisionMetadataSourceFromInfo([{ revision: tag2 }, { revision: tag3 }]),
			);

			const expected = Change.build(
				{
					family,
					maxId: 1,
					revisions: [{ revision: tag3 }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.tomb(moveId.revision, moveId.localId),
					MarkMaker.remove(1, newId),
				]),
			);

			assertEqual(rebased, expected);
		});

		it("node change over remove", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);
			editor.sequenceField({ parent: undefined, field: fieldA }).remove(0, 1);
			editor.sequenceField({ parent: fieldARootPath, field: fieldB }).remove(0, 1);

			const [remove, childChange] = getChanges();

			const rebased = family.rebase(
				tagChangeInline(childChange, tag2),
				tagChangeInline(remove, tag1),
				revisionMetadataSourceFromInfo([{ revision: tag1 }, { revision: tag2 }]),
			);

			const expected = Change.build(
				{
					family,
					maxId: 2,
					revisions: [{ revision: tag2 }],
					roots: [
						{
							detachId: { revision: tag1, localId: brand(0) },
							change: Change.nodeWithId(
								0,
								{ revision: tag2, localId: brand(2) },
								Change.field(fieldB, sequenceIdentifier, [
									MarkMaker.remove(1, { revision: tag2, localId: brand(1) }),
								]),
							),
							detachLocation: { nodeId: undefined, field: fieldA },
						},
					],
				},
				Change.field(fieldA, sequenceIdentifier, [MarkMaker.tomb(tag1, brand(0), 1)]),
			);

			assertEqual(rebased, expected);
		});

		it("remove over move to detached tree", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			// Remove node0 from fieldA
			editor.sequenceField({ parent: undefined, field: fieldA }).remove(0, 1);

			// Concurrently move node1 into fieldB in node0
			editor.move(
				{ parent: undefined, field: fieldA },
				1,
				1,
				{
					parent: fieldARootPath,
					field: fieldB,
				},
				0,
			);

			// Concurrent to the prior change, remove node1 (now at index 0) in fieldA
			editor
				.sequenceField({
					parent: undefined,
					field: fieldA,
				})
				.remove(0, 1);

			const changes = getChanges();
			const baseRemove = tagChangeInline(changes[0], tag1);
			const move = tagChangeInline(changes[1], tag2);
			const remove = tagChangeInline(changes[2], tag3);

			const moveToDetached = tagChange(
				family.rebase(
					move,
					baseRemove,
					revisionMetadataSourceFromInfo([{ revision: tag1 }, { revision: tag2 }]),
				),
				tag2,
			);

			const rebased = family.rebase(
				remove,
				moveToDetached,
				revisionMetadataSourceFromInfo([{ revision: tag2 }, { revision: tag3 }]),
			);

			const expected = Change.build(
				{
					family,
					maxId: 4,
					revisions: [{ revision: tag3 }],
					roots: [
						{
							detachId: { revision: tag1, localId: brand(0) },
							change: Change.nodeWithId(
								0,
								{ revision: tag2, localId: brand(3) },
								Change.field(fieldB, sequenceIdentifier, [
									MarkMaker.remove(1, { revision: tag3, localId: brand(4) }),
								]),
							),
							detachLocation: { nodeId: undefined, field: fieldA },
						},
					],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.tomb(tag1, brand(0), 1),
					MarkMaker.tomb(tag2, brand(1), 1),
				]),
			);

			assertEqual(rebased, expected);
		});

		it("remove over move to detached tree and rename of detached root", () => {
			const moveId: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const oldRootId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const newRootId: ChangeAtomId = { revision: tag2, localId: brand(1) };
			const moveToDetached = Change.build(
				{
					family,
					maxId: 3,
					revisions: [{ revision: tag2 }],
					roots: [
						{
							detachId: { revision: tag1, localId: brand(0) },
							change: Change.nodeWithId(
								0,
								{ revision: tag2, localId: brand(3) },
								Change.field(fieldB, sequenceIdentifier, [MarkMaker.insert(1, moveId)]),
							),
							detachLocation: { nodeId: undefined, field: fieldA },
						},
					],
					renames: [
						{
							oldId: oldRootId,
							newId: newRootId,
							count: 1,
							detachLocation: { nodeId: undefined, field: fieldA },
						},
					],
				},
				Change.field(fieldA, sequenceIdentifier, [MarkMaker.remove(1, moveId)]),
			);

			const remove = Change.build(
				{ family, maxId: 4, revisions: [{ revision: tag3 }] },
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.remove(1, { revision: tag3, localId: brand(4) }),
				]),
			);

			const rebased = family.rebase(
				tagChange(remove, tag3),
				tagChange(moveToDetached, tag2),
				revisionMetadataSourceFromInfo([{ revision: tag2 }, { revision: tag3 }]),
			);

			const expected = Change.build(
				{
					family,
					maxId: 4,
					revisions: [{ revision: tag3 }],
					roots: [
						{
							detachId: newRootId,
							change: Change.nodeWithId(
								0,
								{ revision: tag2, localId: brand(3) },
								Change.field(fieldB, sequenceIdentifier, [
									MarkMaker.remove(1, { revision: tag3, localId: brand(4) }),
								]),
							),
							detachLocation: { nodeId: undefined, field: fieldA },
						},
					],
				},
				Change.field(fieldA, sequenceIdentifier, [MarkMaker.tomb(tag2, brand(0), 1)]),
			);

			assertEqual(rebased, expected);
		});

		it("remove over move to detached tree and reattach of detached root", () => {
			const moveId: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const oldRootId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const newRootId: ChangeAtomId = { revision: tag2, localId: brand(1) };
			const nodeId: ChangeAtomId = { revision: tag2, localId: brand(3) };
			const moveToReattached = Change.build(
				{
					family,
					maxId: 3,
					revisions: [{ revision: tag2 }],
					roots: [
						{
							detachId: { revision: tag1, localId: brand(0) },
							change: Change.nodeWithId(
								0,
								nodeId,
								Change.field(fieldB, sequenceIdentifier, [MarkMaker.insert(1, moveId)]),
							),
						},
					],
					renames: [
						{ oldId: oldRootId, newId: newRootId, count: 1, detachLocation: undefined },
					],
				},
				Change.field(fieldA, sequenceIdentifier, [MarkMaker.remove(1, moveId)]),
				Change.field(fieldC, sequenceIdentifier, [
					MarkMaker.insert(1, oldRootId, {
						revision: newRootId.revision,
						id: newRootId.localId,
					}),
				]),
			);

			const removeId: ChangeAtomId = { revision: tag3, localId: brand(4) };
			const remove = Change.build(
				{ family, maxId: 4, revisions: [{ revision: tag3 }] },
				Change.field(fieldA, sequenceIdentifier, [MarkMaker.remove(1, removeId)]),
			);

			const rebased = family.rebase(
				tagChange(remove, tag3),
				tagChange(moveToReattached, tag2),
				revisionMetadataSourceFromInfo([{ revision: tag2 }, { revision: tag3 }]),
			);

			const expected = Change.build(
				{
					family,
					maxId: 4,
					revisions: [{ revision: tag3 }],
				},
				Change.field(
					fieldC,
					sequenceIdentifier,
					[],
					Change.nodeWithId(
						0,
						nodeId,
						Change.field(fieldB, sequenceIdentifier, [MarkMaker.remove(1, removeId)]),
					),
				),
			);

			assertEqual(rebased, expected);
		});

		it("composite move over move", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			const fieldAPath = { parent: undefined, field: fieldA };
			editor.move(fieldAPath, 0, 1, fieldAPath, 3);
			editor.move(fieldAPath, 0, 1, fieldAPath, 2);
			editor.move(fieldAPath, 1, 1, fieldAPath, 4);

			const [move1Untagged, move2a, move2b] = getChanges();
			const move1 = tagChangeInline(move1Untagged, tag1);
			const move2 = tagChangeInline(
				family.compose([makeAnonChange(move2a), makeAnonChange(move2b)]),
				tag2,
			);

			const rebased = family.rebase(
				move2,
				move1,
				revisionMetadataSourceFromInfo([{ revision: tag1 }, { revision: tag2 }]),
			);

			const expected = Change.build(
				{ family, maxId: 5, revisions: [{ revision: tag2 }] },
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.tomb(tag1, brand(0)),
					MarkMaker.skip(1),
					MarkMaker.rename(
						1,
						{ revision: tag2, localId: brand(3) },
						{ revision: tag2, localId: brand(4) },
					),
					MarkMaker.skip(1),
					MarkMaker.remove(
						1,
						{ revision: tag2, localId: brand(4) },
						{ detachCellId: { revision: tag2, localId: brand(2) } },
					),
					MarkMaker.skip(1),
					MarkMaker.insert(1, { revision: tag2, localId: brand(5) }, { id: brand(4) }),
				]),
			);

			assertEqual(rebased, expected);
		});

		it("composite move over remove", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			const fieldAPath = { parent: undefined, field: fieldA };
			editor.sequenceField(fieldAPath).remove(0, 1);
			editor.move(fieldAPath, 0, 1, fieldAPath, 2);
			editor.move(fieldAPath, 1, 1, fieldAPath, 4);

			const [removeUntagged, moveA, moveB] = getChanges();
			const remove = tagChangeInline(removeUntagged, tag1);
			const move = tagChangeInline(
				family.compose([makeAnonChange(moveA), makeAnonChange(moveB)]),
				tag2,
			);

			const rebased = family.rebase(
				move,
				remove,
				revisionMetadataSourceFromInfo([{ revision: tag1 }, { revision: tag2 }]),
			);

			const oldId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const expected = Change.build(
				{
					family,
					maxId: 4,
					renames: [
						{
							oldId,
							newId: { revision: tag2, localId: brand(3) },
							count: 1,
							detachLocation: { nodeId: undefined, field: fieldA },
						},
					],
					revisions: [{ revision: tag2 }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.rename(1, oldId, { revision: tag2, localId: brand(1) }),
					MarkMaker.skip(1),
					MarkMaker.rename(
						1,
						{ revision: tag2, localId: brand(2) },
						{ revision: tag2, localId: brand(3) },
					),
					MarkMaker.skip(2),
					MarkMaker.insert(1, { revision: tag2, localId: brand(4) }, { id: brand(3) }),
				]),
			);

			assertEqual(rebased, expected);
		});

		it("detached composite move over revive", () => {
			const oldId: ChangeAtomId = { revision: tag3, localId: brand(0) };
			const revive = Change.build(
				{
					family,
					maxId: 0,
					renames: [
						{
							oldId,
							newId: { revision: tag1, localId: brand(0) },
							count: 1,
							detachLocation: { nodeId: undefined, field: fieldA },
						},
					],
					revisions: [{ revision: tag1 }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.revive(1, oldId, { revision: tag1 }),
				]),
			);

			const detachCellId: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const moveId: ChangeAtomId = { revision: tag2, localId: brand(1) };
			const move = Change.build(
				{
					family,
					maxId: 1,
					renames: [
						{
							oldId,
							newId: moveId,
							count: 1,
							detachLocation: { nodeId: undefined, field: fieldA },
						},
					],
					revisions: [{ revision: tag2 }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.rename(1, oldId, detachCellId),
					MarkMaker.moveIn(1, moveId),
				]),
			);

			const rebased = family.rebase(
				tagChange(move, tag2),
				tagChange(revive, tag1),
				revisionMetadataSourceFromInfo([{ revision: tag1 }, { revision: tag2 }]),
			);

			const expected = Change.build(
				{ family, maxId: 1, revisions: [{ revision: tag2 }] },
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.moveOut(1, moveId, { detachCellId }),
					MarkMaker.moveIn(1, moveId),
				]),
			);

			assertEqual(rebased, expected);
		});

		it("root change over detached move", () => {
			const oldId: ChangeAtomId = { revision: tag0, localId: brand(0) };
			const moveId: ChangeAtomId = { revision: tag1, localId: brand(1) };
			const newId: ChangeAtomId = { revision: tag1, localId: brand(3) };

			const fieldAId = { nodeId: undefined, field: fieldA };
			const fieldBId = { nodeId: undefined, field: fieldB };

			const detachedMove = Change.build(
				{
					family,
					renames: [{ oldId, newId, count: 1, detachLocation: fieldAId }],
					detachedMoves: [{ detachId: newId, count: 1, newLocation: fieldBId }],
					revisions: [{ revision: tag1 }],
					maxId: 3,
				},
				Change.field(fieldA, sequenceIdentifier, [MarkMaker.rename(1, oldId, moveId)]),
				Change.field(fieldB, sequenceIdentifier, [
					MarkMaker.rename(1, { revision: tag1, localId: brand(2) }, newId),
				]),
			);

			const rootChange = Change.build(
				{
					family,
					roots: [
						{
							detachId: oldId,
							detachLocation: fieldAId,
							change: Change.nodeWithId(
								0,
								{ revision: tag2, localId: brand(0) },
								Change.field(fieldC, sequenceIdentifier, [
									MarkMaker.remove(1, { revision: tag2, localId: brand(1) }),
								]),
							),
						},
					],
					maxId: 1,
					revisions: [{ revision: tag2 }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.tomb(oldId.revision, oldId.localId, 1),
				]),
			);

			const expected = Change.build(
				{
					family,
					roots: [
						{
							detachId: newId,
							detachLocation: fieldBId,
							change: Change.nodeWithId(
								0,
								{ revision: tag2, localId: brand(0) },
								Change.field(fieldC, sequenceIdentifier, [
									MarkMaker.remove(1, { revision: tag2, localId: brand(1) }),
								]),
							),
						},
					],
					maxId: 3,
					revisions: [{ revision: tag2 }],
				},
				Change.field(fieldB, sequenceIdentifier, [
					MarkMaker.tomb(newId.revision, newId.localId, 1),
				]),
			);

			const rebased = family.rebase(
				tagChange(rootChange, tag2),
				tagChange(detachedMove, tag1),
				revisionMetadataSourceFromInfo([{ revision: tag1 }, { revision: tag2 }]),
			);

			assertEqual(rebased, expected);
		});

		it("prunes its output", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);
			const nodeAPath = fieldARootPath;
			const nodeBPath = fieldBRootPath;

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
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);
			const nodeAPath = fieldARootPath;

			// Moves A to an adjacent cell to its right
			const fieldAPath = { parent: undefined, field: fieldA };
			moveWithin(editor, fieldAPath, 0, 1, 1);

			// Moves B into A
			editor.move(fieldAPath, 1, 1, { parent: nodeAPath, field: fieldB }, 0);

			const nodeBPath: NormalizedUpPath = {
				parent: nodeAPath,
				parentField: fieldB,
				parentIndex: 0,
			};

			// Moves C into B
			editor.move(fieldAPath, 1, 1, { parent: nodeBPath, field: fieldC }, 0);

			const nodeCPath: NormalizedUpPath = {
				parent: nodeBPath,
				parentField: fieldC,
				parentIndex: 0,
			};

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
			validateChangeset(composed, family.fieldKinds);
			const composedDelta = normalizeDelta(intoDelta(makeAnonChange(composed), fieldKinds));

			const nodeAChanges: DeltaFieldMap = new Map([
				[fieldB, { marks: [{ count: 1, attach: { minor: 1, major: tagForCompare } }] }],
			]);

			const nodeBChanges: DeltaFieldMap = new Map([
				[fieldC, { marks: [{ count: 1, attach: { minor: 2, major: tagForCompare } }] }],
			]);

			const nodeCChanges: DeltaFieldMap = new Map([
				[fieldC, { marks: [{ count: 1, detach: { minor: 3, major: tagForCompare } }] }],
			]);

			const fieldAChanges: DeltaFieldChanges = {
				marks: [
					{ count: 1, detach: { minor: 0, major: tagForCompare }, fields: nodeAChanges },
					{ count: 1, attach: { minor: 0, major: tagForCompare } },
					{ count: 1, detach: { minor: 1, major: tagForCompare }, fields: nodeBChanges },
					{ count: 1, detach: { minor: 2, major: tagForCompare }, fields: nodeCChanges },
				],
			};

			const expectedDelta: DeltaRoot = normalizeDelta({
				fields: new Map([[fieldA, fieldAChanges]]),
			});

			assertDeltaEqual(composedDelta, expectedDelta);
		});

		it("cross-field move and nested changes", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);

			const newNode = chunkFromJsonTrees(["new value"]);
			editor.sequenceField({ parent: fieldBRootPath, field: fieldC }).insert(0, newNode);

			const [move, insert] = getChanges();
			const composed = family.compose([makeAnonChange(move), makeAnonChange(insert)]);
			const tagForCompare = mintRevisionTag();
			const taggedComposed = tagChangeInline(composed, tagForCompare);
			const expected: DeltaRoot = {
				build: [{ id: { minor: 2, major: tagForCompare }, trees: newNode }],
				fields: new Map([
					[
						fieldA,
						{
							marks: [
								{
									count: 1,
									detach: { minor: 0, major: tagForCompare },
									fields: new Map([
										[
											fieldC,
											{ marks: [{ count: 1, attach: { minor: 2, major: tagForCompare } }] },
										],
									]),
								},
							],
						},
					],
					[fieldB, { marks: [{ count: 1, attach: { minor: 0, major: tagForCompare } }] }],
				]),
			};

			validateChangeset(composed, family.fieldKinds);
			const delta = intoDelta(taggedComposed, family.fieldKinds);
			assertDeltaEqual(delta, expected);
		});

		it("cross-field move and inverse with nested changes", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);

			const newNode = chunkFromJsonTrees(["new value"]);
			editor.sequenceField({ parent: fieldBRootPath, field: fieldC }).insert(0, newNode);

			const [move, insert] = getChanges();
			const moveTagged = tagChangeInline(move, tag1);
			const returnTagged = tagRollbackInverse(
				family.invert(moveTagged, true, tag3),
				tag3,
				moveTagged.revision,
			);

			const moveAndInsert = family.compose([tagChangeInline(insert, tag2), moveTagged]);
			const composed = family.compose([returnTagged, makeAnonChange(moveAndInsert)]);
			validateChangeset(composed, family.fieldKinds);

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
						{
							marks: [
								{ count: 1 },
								{
									count: 1,
									fields: new Map([
										[fieldC, { marks: [{ count: 1, attach: { major: tag2, minor: 2 } }] }],
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
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);
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

			const [move1, move2] = getChanges();
			const composed = family.compose([
				tagChangeInline(move1, tag1),
				tagChangeInline(move2, tag2),
			]);

			const id1: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const id2: ChangeAtomId = { revision: tag2, localId: brand(2) };

			const expected = Change.build(
				{
					family,
					maxId: 3,
					revisions: [{ revision: tag1 }, { revision: tag2 }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.remove(1, id2, { detachCellId: id1 }),
				]),
				Change.field(fieldB, sequenceIdentifier, [
					MarkMaker.rename(
						1,
						{ revision: tag1, localId: brand(1) },
						{ revision: tag2, localId: brand(2) },
					),
				]),
				Change.field(fieldC, sequenceIdentifier, [
					MarkMaker.insert(1, { revision: tag2, localId: brand(3) }, { id: id2.localId }),
				]),
			);

			assertEqual(composed, expected);
		});

		it("move and modify with modify", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldA },
				0,
			);

			editor.sequenceField({ parent: fieldARootPath, field: fieldB }).remove(0, 1);
			editor.sequenceField({ parent: fieldARootPath, field: fieldB }).remove(0, 1);

			const [move, modify1, modify2] = getChanges();
			const moveAndModify = family.compose([makeAnonChange(move), makeAnonChange(modify1)]);

			const composed = family.compose([
				tagChangeInline(moveAndModify, tag1),
				tagChangeInline(modify2, tag2),
			]);

			const expected = Change.build(
				{ family, maxId: 5, revisions: [{ revision: tag1 }, { revision: tag2 }] },
				Change.field(
					fieldA,
					sequenceIdentifier,
					[
						MarkMaker.insert(1, { revision: tag1, localId: brand(1) }, { id: brand(0) }),
						MarkMaker.remove(1, { revision: tag1, localId: brand(0) }),
					],
					Change.nodeWithId(
						0,
						{ revision: tag1, localId: brand(3) },
						Change.field(fieldB, sequenceIdentifier, [
							MarkMaker.remove(1, { revision: tag1, localId: brand(2) }),
							MarkMaker.remove(1, { revision: tag2, localId: brand(4) }),
						]),
					),
				),
			);
			assertModularChangesetsEqual(composed, expected);
		});

		it("move and remove", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			const fieldAPath = { parent: undefined, field: fieldA };
			editor.move(fieldAPath, 0, 1, fieldAPath, 2);
			editor.sequenceField(fieldAPath).remove(1, 1);

			const [moveUntagged, removeUntagged] = getChanges();
			const move = tagChangeInline(moveUntagged, tag1);
			const remove = tagChangeInline(removeUntagged, tag2);

			const composed = family.compose([move, remove]);

			const detachCellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const detachId: ChangeAtomId = { revision: tag2, localId: brand(2) };
			const fieldAId = { nodeId: undefined, field: fieldA };
			const expected = Change.build(
				{
					family,
					maxId: 2,
					detachedMoves: [
						{
							detachId,
							count: 1,
							newLocation: fieldAId,
						},
					],
					revisions: [{ revision: tag1 }, { revision: tag2 }],
				},

				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.remove(1, detachId, {
						detachCellId,
					}),
					MarkMaker.skip(1),
					MarkMaker.rename(
						1,
						{ revision: tag1, localId: brand(1) },
						{ revision: tag2, localId: brand(2) },
					),
				]),
			);

			assertEqual(composed, expected);
		});

		it("move root and remove", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			const fieldAPath = { parent: undefined, field: fieldA };
			editor.sequenceField(fieldAPath).remove(0, 1);
			editor.move(fieldAPath, 0, 1, fieldAPath, 2);
			editor.sequenceField(fieldAPath).remove(1, 1);

			const [remove1Untagged, moveUntagged, remove2Untagged] = getChanges();
			const moveRoot = tagChange(
				family.rebase(
					tagChangeInline(moveUntagged, tag1),
					tagChangeInline(remove1Untagged, tag3),
					revisionMetadataSourceFromInfo([{ revision: tag3 }, { revision: tag1 }]),
				),
				tag1,
			);

			const remove = tagChangeInline(remove2Untagged, tag2);
			const composed = family.compose([moveRoot, remove]);

			const oldId: ChangeAtomId = { revision: tag3, localId: brand(0) };
			const newId: ChangeAtomId = { revision: tag2, localId: brand(3) };
			const fieldAId = { nodeId: undefined, field: fieldA };
			const expected = Change.build(
				{
					family,
					maxId: 3,
					renames: [{ oldId, newId, count: 1, detachLocation: fieldAId }],
					detachedMoves: [
						{
							detachId: newId,
							count: 1,
							newLocation: fieldAId,
						},
					],
					revisions: [{ revision: tag1 }, { revision: tag2 }],
				},

				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.rename(1, oldId, { revision: tag1, localId: brand(1) }),
					MarkMaker.skip(1),
					MarkMaker.rename(1, { revision: tag1, localId: brand(2) }, newId),
				]),
			);

			assertEqual(composed, expected);
		});

		it("detach and (move and remove)", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			const fieldAPath = { parent: undefined, field: fieldA };
			editor.sequenceField(fieldAPath).remove(0, 1);
			editor.move(fieldAPath, 0, 1, fieldAPath, 2);
			editor.sequenceField(fieldAPath).remove(1, 1);

			const [remove1Untagged, moveUntagged, remove2Untagged] = getChanges();
			const remove = tagChangeInline(remove1Untagged, tag1);
			const moveAndRemoveInitial = tagChangeInline(
				family.compose([makeAnonChange(moveUntagged), makeAnonChange(remove2Untagged)]),
				tag2,
			);

			const moveAndRemove = tagChange(
				family.rebase(
					moveAndRemoveInitial,
					remove,
					revisionMetadataSourceFromInfo([{ revision: tag1 }, { revision: tag2 }]),
				),
				tag2,
			);

			const composed = family.compose([remove, moveAndRemove]);

			const fieldAId = { nodeId: undefined, field: fieldA };
			const detachId: ChangeAtomId = { revision: tag2, localId: brand(3) };
			const expected = Change.build(
				{
					family,
					maxId: 3,
					detachedMoves: [{ detachId, count: 1, newLocation: fieldAId }],
					revisions: [{ revision: tag1 }, { revision: tag2 }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.remove(
						1,
						{ revision: tag2, localId: brand(3) },
						{
							detachCellId: { revision: tag1, localId: brand(0) },
							cellRename: { revision: tag2, localId: brand(1) }, // XXX: Is this correct?
						},
					),
					MarkMaker.skip(1),
					MarkMaker.rename(
						1,
						{ revision: tag2, localId: brand(2) },
						{ revision: tag2, localId: brand(3) },
					),
				]),
			);

			assertEqual(composed, expected);
		});

		it("detached move and reattach", () => {
			const fieldAId = { nodeId: undefined, field: fieldA };
			const oldId: ChangeAtomId = { revision: tag0, localId: brand(0) };
			const newId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const cellId1: ChangeAtomId = { revision: tag1, localId: brand(1) };
			const cellId2: ChangeAtomId = { revision: tag1, localId: brand(2) };
			const detachedMove = Change.build(
				{
					family,
					maxId: 2,
					revisions: [{ revision: tag1 }],
					renames: [
						{
							oldId,
							count: 1,
							newId,
							detachLocation: fieldAId,
						},
					],
					detachedMoves: [{ detachId: newId, count: 1, newLocation: fieldAId }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.rename(1, oldId, cellId1),
					MarkMaker.rename(1, cellId2, newId),
				]),
			);

			const attachId: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const reattach = Change.build(
				{
					family,
					maxId: 0,
					revisions: [{ revision: tag2 }],
					renames: [{ oldId: newId, count: 1, newId: attachId, detachLocation: fieldAId }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.tomb(cellId1.revision, cellId1.localId, 1),
					MarkMaker.insert(1, newId, { revision: attachId.revision, id: attachId.localId }),
				]),
			);

			const composed = family.compose([
				tagChange(detachedMove, tag1),
				tagChange(reattach, tag2),
			]);

			const expected = Change.build(
				{
					family,
					maxId: 2,
					revisions: [{ revision: tag1 }, { revision: tag2 }],
					renames: [{ oldId, count: 1, newId: attachId, detachLocation: fieldAId }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.rename(1, oldId, cellId1),
					MarkMaker.insert(1, cellId2, { revision: attachId.revision, id: attachId.localId }),
				]),
			);

			assertEqual(composed, expected);
		});

		it("(move and detach) and reattach", () => {
			const fieldAId = { nodeId: undefined, field: fieldA };
			const detachId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const cellId1: ChangeAtomId = { revision: tag1, localId: brand(1) };
			const cellId2: ChangeAtomId = { revision: tag1, localId: brand(2) };
			const detachAndMove = Change.build(
				{
					family,
					maxId: 2,
					revisions: [{ revision: tag1 }],
					detachedMoves: [{ detachId, count: 1, newLocation: fieldAId }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.remove(1, detachId, { detachCellId: cellId1 }),
					MarkMaker.rename(1, cellId2, detachId),
				]),
			);

			const attachId: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const reattach = Change.build(
				{
					family,
					maxId: 0,
					revisions: [{ revision: tag2 }],
					renames: [{ oldId: detachId, count: 1, newId: attachId, detachLocation: fieldAId }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.tomb(cellId1.revision, cellId1.localId, 1),
					MarkMaker.insert(1, detachId, { revision: attachId.revision, id: attachId.localId }),
				]),
			);

			const composed = family.compose([
				tagChange(detachAndMove, tag1),
				tagChange(reattach, tag2),
			]);

			const expected = Change.build(
				{
					family,
					maxId: 2,
					revisions: [{ revision: tag1 }, { revision: tag2 }],
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.remove(1, attachId, { detachCellId: cellId1 }),
					MarkMaker.insert(1, cellId2, { revision: attachId.revision, id: attachId.localId }),
				]),
			);

			assertEqual(composed, expected);
		});
	});

	describe("invert", () => {
		it("Cross-field move of edited node", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			editor.enterTransaction();

			// Remove a node
			editor.sequenceField({ parent: fieldARootPath, field: fieldC }).remove(0, 1);

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
					{
						family,
						maxId: 3,
						renames: [
							{
								oldId: { revision: tag1, localId: brand(0) },
								newId: { revision: tag2, localId: brand(0) },
								count: 1,
								detachLocation: {
									nodeId: { revision: tag1, localId: brand(1) },
									field: fieldC,
								},
							},
						],
					},
					Change.field(fieldA, sequenceIdentifier, fieldAExpected),
					Change.field(
						fieldB,
						sequenceIdentifier,
						fieldBExpected,
						Change.nodeWithId(
							0,
							{ revision: tag1, localId: brand(1) },
							Change.field(fieldC, sequenceIdentifier, fieldCExpected),
						),
					),
				),
				tag2,
			).change;

			assertEqual(inverse, expected);
		});

		it("Nested moves both requiring a second pass", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			const fieldAPath = { parent: undefined, field: fieldA };
			editor.enterTransaction();

			// Moves node1 to an earlier position in the field
			moveWithin(editor, fieldAPath, 1, 1, 0);
			const node1Path: NormalizedUpPath = {
				detachedNodeId: undefined,
				parent: undefined,
				parentField: fieldA,
				parentIndex: 0,
			};
			const node2Path: NormalizedUpPath = {
				parent: node1Path,
				parentField: fieldB,
				parentIndex: 0,
			};

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

			// Modifies node2 so that both fieldA and fieldB have changes that need to be transferred
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

			const fieldAExpected: Changeset = [
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
					{
						family,
						maxId: 7,
						renames: [
							{
								oldId: { revision: tag1, localId: brand(5) },
								newId: { revision: tag2, localId: brand(5) },
								count: 1,
								detachLocation: {
									nodeId: { revision: tag1, localId: brand(6) },
									field: fieldC,
								},
							},
						],
					},
					Change.field(
						fieldA,
						sequenceIdentifier,
						fieldAExpected,
						Change.nodeWithId(
							0,
							nodeId1,
							Change.field(
								fieldB,
								sequenceIdentifier,
								fieldBExpected,
								Change.nodeWithId(
									0,
									nodeId2,
									Change.field(fieldC, sequenceIdentifier, fieldCExpected),
								),
							),
						),
					),
				),
				tag2,
			).change;

			assertEqual(inverse, expected);
		});

		it("Undo move with rename", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(
				family,
				mintRevisionTag,
				changeReceiver,
				codecOptions,
			);

			const fieldAPath = { parent: undefined, field: fieldA };

			// Make a transaction which moves the same node twice.
			editor.enterTransaction();
			moveWithin(editor, fieldAPath, 0, 1, 1);
			moveWithin(editor, fieldAPath, 0, 1, 1);
			editor.exitTransaction();

			const [move1, move2] = getChanges();
			const move = tagChangeInline(
				family.compose([tagChangeInline(move1, tag1), tagChangeInline(move2, tag2)]),
				tag3,
			);

			const undo = family.invert(move, false, tag4);

			const originalDetachCellId: ChangeAtomId = { revision: tag3, localId: brand(0) };
			const id2Original: ChangeAtomId = { revision: tag3, localId: brand(2) };
			const id2Undo: ChangeAtomId = { revision: tag4, localId: brand(2) };

			const expected = Change.build(
				{
					family,
					revisions: [{ revision: tag4 }],
					maxId: 3,
				},
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.insert(1, id2Undo, { cellId: originalDetachCellId }),
					MarkMaker.tomb(id2Original.revision, id2Original.localId, 1),
					MarkMaker.remove(1, id2Undo),
				]),
			);

			assertEqual(undo, expected);
		});

		it("Undo insert and move", () => {
			// This tests undoing a single insert mark representing a move of the first node and an insert of the second.
			const change = Change.build(
				{ family, maxId: 3 },
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.insert(2, brand(2), { id: brand(0) }),
					MarkMaker.remove(1, brand(0)),
				]),
			);

			const inverse = family.invert(tagChangeInline(change, tag1), false, tag2);
			const expected = Change.build(
				{ family, maxId: 3, revisions: [{ revision: tag2 }] },
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.remove(2, { revision: tag2, localId: brand(0) }),
					MarkMaker.insert(1, { revision: tag1, localId: brand(0) }, { revision: tag2 }),
				]),
			);

			assertEqual(inverse, expected);
		});

		it("Revive and modify", () => {
			const change = Change.build(
				{
					family,
					maxId: 3,
					roots: [
						{
							detachId: { localId: brand(1) },
							change: Change.nodeWithId(
								0,
								{ localId: brand(2) },
								Change.field(fieldB, sequenceIdentifier, [MarkMaker.remove(1, brand(3))]),
							),
						},
					],
				},
				Change.field(fieldA, sequenceIdentifier, [MarkMaker.insert(2, brand(0))]),
			);

			const taggedChange = tagChangeInline(change, tag1);
			const inverse = family.invert(taggedChange, true, tag2);

			const expected = Change.build(
				{ family, maxId: 3, revisions: [{ revision: tag2, rollbackOf: tag1 }] },
				Change.field(
					fieldA,
					sequenceIdentifier,
					[MarkMaker.remove(2, { revision: tag1, localId: brand(0) })],
					Change.nodeWithId(
						1,
						{ revision: tag1, localId: brand(2) },
						Change.field(fieldB, sequenceIdentifier, [
							MarkMaker.insert(1, { revision: tag1, localId: brand(3) }),
						]),
					),
				),
			);

			assertModularChangesetsEqual(inverse, expected);
		});

		it("Detached move", () => {
			const oldId: ChangeAtomId = { revision: tag0, localId: brand(0) };
			const moveId: ChangeAtomId = { revision: tag1, localId: brand(1) };
			const newId: ChangeAtomId = { revision: tag1, localId: brand(3) };

			const fieldAId = { nodeId: undefined, field: fieldA };
			const fieldBId = { nodeId: undefined, field: fieldB };

			const detachedMove = Change.build(
				{
					family,
					renames: [{ oldId, newId, count: 1, detachLocation: fieldAId }],
					detachedMoves: [{ detachId: newId, count: 1, newLocation: fieldBId }],
					revisions: [{ revision: tag1 }],
					maxId: 3,
				},
				Change.field(fieldA, sequenceIdentifier, [MarkMaker.rename(1, oldId, moveId)]),
				Change.field(fieldB, sequenceIdentifier, [
					MarkMaker.rename(1, { revision: tag1, localId: brand(2) }, newId),
				]),
			);

			const inverse = family.invert(tagChange(detachedMove, tag1), true, tag2);

			const expected = Change.build(
				{
					family,
					renames: [{ oldId: newId, newId: oldId, count: 1, detachLocation: fieldBId }],
					detachedMoves: [{ detachId: oldId, count: 1, newLocation: fieldAId }],
					revisions: [{ revision: tag2, rollbackOf: tag1 }],
					maxId: 3,
				},
				Change.field(fieldA, sequenceIdentifier, [MarkMaker.rename(1, moveId, oldId)]),
				Change.field(fieldB, sequenceIdentifier, [
					MarkMaker.rename(1, newId, { revision: tag1, localId: brand(2) }),
				]),
			);

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
					fieldKind: sequenceIdentifier,
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
					fieldKind: sequenceIdentifier,
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
					[brand("foo"), { marks: [moveOut1, moveIn1] }],
					[brand("bar"), { marks: [moveOut2, moveIn2] }],
				]),
			};
			const actual = intoDelta(makeAnonChange(change), family.fieldKinds);
			assertEqual(actual, expected);
		});
	});

	describe("Encoding", () => {
		const sessionId = "session1" as SessionId;
		const context: ChangeEncodingContext = {
			originatorId: sessionId,
			revision: tag1,
			idCompressor: testIdCompressor,
		};

		const fieldAPath = { parent: rootPath, field: fieldA };
		const fieldAId = { nodeId: undefined, field: fieldA };
		const revisions = [{ revision: tag1 }];

		const revive = Change.build(
			{
				family,
				maxId: 1,
				renames: [
					{
						oldId: { revision: tag2, localId: brand(0) },
						newId: { revision: tag1, localId: brand(0) },
						count: 2,
						detachLocation: fieldAId,
					},
				],
				revisions,
			},
			Change.field(fieldA, sequenceIdentifier, [
				MarkMaker.revive(2, { revision: tag2, localId: brand(0) }, { revision: tag1 }),
			]),
		);

		const move = buildTransaction((editor) => {
			editor.move(fieldAPath, 1, 1, fieldAPath, 0);
		}, tag1).change;

		const editDetachedInSequence = Change.build(
			{
				family,
				maxId: 1,
				roots: [
					{
						detachId: { revision: tag2, localId: brand(0) },
						detachLocation: fieldAId,
						change: Change.nodeWithId(
							0,
							{ revision: tag1, localId: brand(1) },
							Change.field(fieldB, sequenceIdentifier, [
								MarkMaker.remove(1, { revision: tag1, localId: brand(0) }),
							]),
						),
					},
				],
				revisions,
			},
			Change.field(fieldA, sequenceIdentifier, [MarkMaker.tomb(tag2, brand(0))]),
		);

		const editDetachedInOptional = Change.build(
			{
				family,
				maxId: 1,
				roots: [
					{
						detachId: { revision: tag2, localId: brand(0) },
						detachLocation: fieldAId,
						change: Change.nodeWithId(
							0,
							{ revision: tag1, localId: brand(1) },
							Change.field(fieldB, sequenceIdentifier, [
								MarkMaker.remove(1, { revision: tag1, localId: brand(0) }),
							]),
						),
					},
				],
				revisions,
			},
			Change.field(fieldA, optionalIdentifier, {}),
		);

		const compositeMove = buildTransaction((editor) => {
			editor.move(fieldAPath, 1, 1, fieldAPath, 0);
			editor.move(fieldAPath, 0, 1, fieldAPath, 2);
		}, tag1).change;

		// We use a function just to keep local variables in a separate namespace.
		const compositeMoveWithCellRename: ModularChangeset = (() => {
			const detachId1: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const attachId1: ChangeAtomId = { revision: tag1, localId: brand(1) };
			const detachId2: ChangeAtomId = { revision: tag1, localId: brand(2) };
			const detachId3: ChangeAtomId = { revision: tag1, localId: brand(4) };
			const attachId3: ChangeAtomId = { revision: tag1, localId: brand(5) };

			// This represents the composition of:
			// - move from cell 1 to cell 2,
			// - move from cell 2 back to cell 1
			// - move from cell 1 to cell 3
			return Change.build(
				{ family, maxId: 5, revisions },
				Change.field(fieldA, sequenceIdentifier, [
					MarkMaker.remove(1, detachId3, {
						detachCellId: detachId1,
						cellRename: detachId3,
					}),
					MarkMaker.rename(1, attachId1, detachId2),
					MarkMaker.insert(1, attachId3, { id: detachId3.localId }),
				]),
			);
		})();

		const moveAndRemove = buildTransaction((editor) => {
			editor.move(fieldAPath, 1, 1, fieldAPath, 0);
			editor.sequenceField(fieldAPath).remove(0, 1);
		}, tag1).change;

		const oldId: ChangeAtomId = { revision: tag2, localId: brand(0) };
		const moveOutId: ChangeAtomId = { revision: tag1, localId: brand(0) };
		const moveInId: ChangeAtomId = { revision: tag1, localId: brand(1) };
		const reviveAndMoveWithSeparateIds = Change.build(
			{
				family,
				maxId: 1,
				renames: [
					{
						oldId,
						newId: moveInId,
						count: 1,
						detachLocation: fieldAId,
					},
				],
				revisions,
			},
			Change.field(fieldA, sequenceIdentifier, [
				MarkMaker.rename(1, oldId, moveOutId),
				MarkMaker.revive(1, moveInId, { revision: tag1 }),
			]),
		);

		const reviveAndMoveWithSameId = Change.build(
			{
				family,
				maxId: 1,
				renames: [
					{
						oldId,
						newId: moveInId,
						count: 1,
						detachLocation: fieldAId,
					},
				],
				revisions,
			},
			Change.field(fieldA, sequenceIdentifier, [
				MarkMaker.rename(1, oldId, moveInId),
				MarkMaker.revive(1, moveInId, { revision: tag1 }),
			]),
		);

		const removeId: ChangeAtomId = { revision: tag1, localId: brand(2) };
		const reviveMoveAndRemove = Change.build(
			{
				family,
				maxId: 2,
				renames: [
					{
						oldId,
						newId: removeId,
						count: 1,
						detachLocation: fieldAId,
					},
				],
				detachedMoves: [{ detachId: removeId, count: 1, newLocation: fieldAId }],
				revisions,
			},
			Change.field(fieldA, sequenceIdentifier, [
				MarkMaker.rename(1, oldId, moveOutId),
				MarkMaker.rename(1, moveInId, removeId),
			]),
		);

		const renameInSequence = Change.build(
			{
				family,
				maxId: 2,
				renames: [
					{
						oldId,
						newId: removeId,
						count: 1,
						detachLocation: fieldAId,
					},
				],
				revisions,
			},
			Change.field(fieldA, sequenceIdentifier, [MarkMaker.rename(1, oldId, removeId)]),
		);

		const renameInOptional = Change.build(
			{
				family,
				maxId: 1,
				renames: [
					{
						oldId,
						newId: removeId,
						count: 1,
						detachLocation: fieldAId,
					},
				],
				revisions,
			},
			Change.field(fieldA, optionalIdentifier, {}),
		);

		const fieldBId = { nodeId: undefined, field: fieldB };
		const moveDetached = Change.build(
			{
				family,
				renames: [{ oldId, newId: removeId, count: 1, detachLocation: fieldAId }],
				detachedMoves: [{ detachId: removeId, count: 1, newLocation: fieldBId }],
				revisions,
				maxId: 3,
			},
			Change.field(fieldA, sequenceIdentifier, [MarkMaker.rename(1, oldId, moveOutId)]),
			Change.field(fieldB, sequenceIdentifier, [MarkMaker.rename(1, moveInId, removeId)]),
		);

		const moveDetachedWithCellDetachId = family.rebase(
			tagChange(compositeMoveWithCellRename, tag1),
			buildTransaction((editor) => {
				editor.sequenceField(fieldAPath).remove(0, 1);
			}, tag0),
			revisionMetadataSourceFromInfo([{ revision: tag0 }, { revision: tag1 }]),
		);

		const encodingTestData: EncodingTestData<
			ModularChangeset,
			EncodedModularChangesetV1,
			ChangeEncodingContext
		> = {
			successes: [
				["revive", revive, context],
				["move", move, context],
				["composite move", compositeMove, context],
				["composite move with cell rename", compositeMoveWithCellRename, context],
				["move detached", moveDetached, context],
				["move detached with cell rename", moveDetachedWithCellDetachId, context],
				["move and remove", moveAndRemove, context],
				["revive and move (separate IDs)", reviveAndMoveWithSeparateIds, context],
				["revive and move (same ID)", reviveAndMoveWithSameId, context],
				["revive, move, and remove", reviveMoveAndRemove, context],
				["edit detached (sequence field)", editDetachedInSequence, context],
				["edit detached (optional field)", editDetachedInOptional, context],
				["rename in optional field", renameInOptional, context],
				["rename in sequence field", renameInSequence, context],
			],
		};

		makeEncodingTestSuite(
			family.codecs,
			encodingTestData,
			assertModularChangesetsEqual,
			[3, 4],
		);

		// In the detached root format, we no longer encode information about root locations.
		makeEncodingTestSuite(
			family.codecs,
			encodingTestData,
			assertModularChangesetsEqualIgnoreRebaseVersion,
			[101],
		);
	});
});

function buildTransaction(
	delegate: (editor: DefaultEditBuilder) => void,
	revision?: RevisionTag,
): TaggedChange<ModularChangeset> {
	const [changeReceiver, getChanges] = testChangeReceiver(family);
	const transaction = new DefaultEditBuilder(
		family,
		mintRevisionTag,
		changeReceiver,
		codecOptions,
	);
	delegate(transaction);
	const changes = getChanges();
	const tag = revision ?? mintRevisionTag();
	const composed = family.compose(changes.map((change) => makeAnonChange(change)));
	return tagChange(
		family.changeRevision(
			composed,
			new DefaultRevisionReplacer(tag, family.getRevisions(composed)),
		),
		tag,
	);
}

function tagChangeInline(
	change: ModularChangeset,
	revision: RevisionTag,
): TaggedChange<ModularChangeset> {
	return tagChange(
		family.changeRevision(
			change,
			new DefaultRevisionReplacer(revision, family.getRevisions(change)),
		),
		revision,
	);
}

function buildChangeset(edits: EditDescription[]): ModularChangeset {
	const editor = family.buildEditor(mintRevisionTag, () => undefined);
	return editor.buildChanges(edits);
}
