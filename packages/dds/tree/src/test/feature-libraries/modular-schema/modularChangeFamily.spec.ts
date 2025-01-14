/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { SessionId } from "@fluidframework/id-compressor";

import { type ICodecOptions, type IJsonCodec, makeCodecFamily } from "../../../codec/index.js";
import {
	type FieldChangeHandler,
	genericFieldKind,
	type ModularChangeset,
	FieldKindWithEditor,
	type RelevantRemovedRootsFromChild,
	chunkTree,
	defaultChunkPolicy,
	type TreeChunk,
	cursorForJsonableTreeField,
	chunkFieldSingle,
	makeFieldBatchCodec,
	type NodeId,
	type FieldKindConfiguration,
	type FieldKindConfigurationEntry,
	makeModularChangeCodecFamily,
	ModularChangeFamily,
	type EncodedModularChangeset,
	type FieldChangeRebaser,
	type FieldEditor,
	type EditDescription,
	jsonableTreeFromFieldCursor,
} from "../../../feature-libraries/index.js";
import {
	makeAnonChange,
	makeDetachedNodeId,
	type RevisionTag,
	tagChange,
	type TaggedChange,
	type FieldKindIdentifier,
	type FieldKey,
	type UpPath,
	revisionMetadataSourceFromInfo,
	type ITreeCursorSynchronous,
	type DeltaFieldChanges,
	type DeltaRoot,
	type DeltaDetachedNodeId,
	type ChangeEncodingContext,
	type ChangeAtomIdMap,
	Multiplicity,
	replaceAtomRevisions,
	type FieldUpPath,
	type RevisionInfo,
} from "../../../core/index.js";
import {
	type Mutable,
	brand,
	idAllocatorFromMaxId,
	nestedMapFromFlatList,
	newTupleBTree,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../../util/index.js";
import {
	type EncodingTestData,
	assertDeltaEqual,
	makeEncodingTestSuite,
	mintRevisionTag,
	testChangeReceiver,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";

import { type ValueChangeset, valueField } from "./basicRebasers.js";
import { ajvValidator } from "../../codec/index.js";
import { fieldJsonCursor, singleJsonCursor } from "../../json/index.js";
import type {
	ChangeAtomIdBTree,
	CrossFieldKeyTable,
	FieldChangeMap,
	FieldId,
	NodeChangeset,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeTypes.js";
import {
	getFieldKind,
	intoDelta,
	updateRefreshers,
	relevantRemovedRoots as relevantDetachedTreesImplementation,
	newCrossFieldKeyTable,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import type {
	EncodedNodeChangeset,
	FieldChangeEncodingContext,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
import { deepFreeze as deepFreezeBase } from "@fluidframework/test-runtime-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";
import { assertEqual, Change, removeAliases } from "./modularChangesetUtil.js";

type SingleNodeChangeset = NodeId | undefined;
const singleNodeRebaser: FieldChangeRebaser<SingleNodeChangeset> = {
	compose: (change1, change2, composeChild) =>
		change1 === undefined && change2 === undefined
			? undefined
			: composeChild(change1, change2),
	invert: (change) => change,
	rebase: (change, base, rebaseChild) => rebaseChild(change, base),
	prune: (change, pruneChild) => (change === undefined ? undefined : pruneChild(change)),
	replaceRevisions: (change, oldRevisions, newRevision) =>
		change !== undefined ? replaceAtomRevisions(change, oldRevisions, newRevision) : undefined,
};

const singleNodeEditor: FieldEditor<SingleNodeChangeset> = {
	buildChildChange: (index: number, change: NodeId): SingleNodeChangeset => {
		assert(index === 0, "This field kind only supports one node in its field");
		return change;
	},
};

const emptyEncodedChange = "";
const singleNodeCodec: IJsonCodec<
	SingleNodeChangeset,
	EncodedNodeChangeset | "",
	EncodedNodeChangeset | "",
	FieldChangeEncodingContext
> = {
	encode: (change, context) => {
		return change === undefined ? emptyEncodedChange : context.encodeNode(change);
	},

	decode: (encoded, context) => {
		return encoded === emptyEncodedChange ? undefined : context.decodeNode(encoded);
	},
};

const singleNodeHandler: FieldChangeHandler<SingleNodeChangeset> = {
	rebaser: singleNodeRebaser,
	codecsFactory: (revisionTagCodec) => makeCodecFamily([[1, singleNodeCodec]]),
	editor: singleNodeEditor,
	intoDelta: (change, deltaFromChild): DeltaFieldChanges => ({
		local: [{ count: 1, fields: change !== undefined ? deltaFromChild(change) : undefined }],
	}),
	relevantRemovedRoots: (change, relevantRemovedRootsFromChild) =>
		change !== undefined ? relevantRemovedRootsFromChild(change) : [],

	// We create changesets by composing an empty single node field with a change to the child.
	// We don't want the temporarily empty single node field to be pruned away leaving us with a generic field instead.
	isEmpty: (change) => false,
	getNestedChanges: (change) => (change === undefined ? [] : [[change, 0, 0]]),
	createEmpty: () => undefined,
	getCrossFieldKeys: (_change) => [],
};

const singleNodeField = new FieldKindWithEditor(
	"SingleNode",
	Multiplicity.Single,
	singleNodeHandler,
	(a, b) => false,
	new Set(),
);

export const fieldKindConfiguration: FieldKindConfiguration = new Map<
	FieldKindIdentifier,
	FieldKindConfigurationEntry
>([
	[singleNodeField.identifier, { kind: singleNodeField, formatVersion: 1 }],
	[valueField.identifier, { kind: valueField, formatVersion: 1 }],
]);

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor> = new Map(
	[singleNodeField, valueField].map((field) => [field.identifier, field]),
);

const codecOptions: ICodecOptions = {
	jsonValidator: ajvValidator,
};

const codec = makeModularChangeCodecFamily(
	new Map([[1, fieldKindConfiguration]]),
	testRevisionTagCodec,
	makeFieldBatchCodec(codecOptions, 1),
	codecOptions,
);
const family = new ModularChangeFamily(fieldKinds, codec);

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tag4: RevisionTag = mintRevisionTag();

const fieldA: FieldKey = brand("a");
const fieldB: FieldKey = brand("b");

const valueChange1a: ValueChangeset = { old: 0, new: 1 };
const valueChange1b: ValueChangeset = { old: 0, new: 2 };
const valueChange2: ValueChangeset = { old: 1, new: 2 };

const nodeId1: NodeId = { localId: brand(1) };
const nodeId2: NodeId = { localId: brand(2) };

const pathA: FieldUpPath = { parent: undefined, field: fieldA };
const pathA0: UpPath = { parent: undefined, parentField: fieldA, parentIndex: 0 };
const pathB: FieldUpPath = { parent: undefined, field: fieldB };
const pathB0: UpPath = { parent: undefined, parentField: fieldB, parentIndex: 0 };
const pathA0A: FieldUpPath = { parent: pathA0, field: fieldA };
const pathA0B: FieldUpPath = { parent: pathA0, field: fieldB };
const pathB0A: FieldUpPath = { parent: pathB0, field: fieldA };

const mainEditor = family.buildEditor(() => undefined);
const rootChange1a = removeAliases(
	mainEditor.buildChanges([
		{
			type: "field",
			field: pathA,
			fieldKind: singleNodeField.identifier,
			change: brand(undefined),
			revision: tag1,
		},
		{
			type: "field",
			field: pathA0A,
			fieldKind: valueField.identifier,
			change: brand(valueChange1a),
			revision: tag1,
		},
		{
			type: "field",
			field: pathB,
			fieldKind: valueField.identifier,
			change: brand(valueChange2),
			revision: tag1,
		},
	]),
);

const rootChange1aGeneric: ModularChangeset = removeAliases(
	mainEditor.buildChanges([
		{
			type: "field",
			field: pathA0A,
			fieldKind: valueField.identifier,
			change: brand(valueChange1a),
			revision: tag1,
		},
		{
			type: "field",
			field: pathB,
			fieldKind: valueField.identifier,
			change: brand(valueChange2),
			revision: tag1,
		},
	]),
);

const rootChange1b: ModularChangeset = removeAliases(
	mainEditor.buildChanges([
		{
			type: "field",
			field: pathA,
			fieldKind: singleNodeField.identifier,
			change: brand(undefined),
			revision: tag1,
		},
		{
			type: "field",
			field: pathA0A,
			fieldKind: valueField.identifier,
			change: brand(valueChange1b),
			revision: tag1,
		},
		{
			type: "field",
			field: pathA0B,
			fieldKind: valueField.identifier,
			change: brand(valueChange1a),
			revision: tag1,
		},
	]),
);

const rootChange1bGeneric: ModularChangeset = removeAliases(
	mainEditor.buildChanges([
		{
			type: "field",
			field: pathA0A,
			fieldKind: valueField.identifier,
			change: brand(valueChange1b),
			revision: tag1,
		},
		{
			type: "field",
			field: pathA0B,
			fieldKind: valueField.identifier,
			change: brand(valueChange1a),
			revision: tag1,
		},
	]),
);

const rebasedChange: ModularChangeset = removeAliases(
	Change.build(
		{ family, maxId: rootChange1b.maxId },
		Change.field(
			fieldA,
			singleNodeField.identifier,
			singleNodeField.changeHandler.createEmpty(),
			Change.nodeWithId(
				0,
				{ localId: brand(2) },
				Change.field(fieldA, valueField.identifier, valueChange2),
				Change.field(fieldB, valueField.identifier, valueChange1a),
			),
		),
	),
);

const rebasedChangeGeneric: ModularChangeset = removeAliases(
	Change.build(
		{ family, maxId: rootChange1bGeneric.maxId },
		Change.field(
			fieldA,
			genericFieldKind.identifier,
			genericFieldKind.changeHandler.createEmpty(),
			Change.nodeWithId(
				0,
				{ localId: brand(4) },
				Change.field(fieldA, valueField.identifier, valueChange2),
				Change.field(fieldB, valueField.identifier, valueChange1a),
			),
		),
	),
);

const genericChangeRebasedOverSpecific: ModularChangeset = removeAliases(
	Change.build(
		{ family, maxId: rootChange1bGeneric.maxId },
		Change.field(
			fieldA,
			singleNodeField.identifier,
			singleNodeField.changeHandler.createEmpty(),
			Change.nodeWithId(
				0,
				{ localId: brand(4) },
				Change.field(fieldA, valueField.identifier, valueChange2),
				Change.field(fieldB, valueField.identifier, valueChange1a),
			),
		),
	),
);

const rootChange2: ModularChangeset = removeAliases(
	mainEditor.buildChanges([
		{
			type: "field",
			field: pathA,
			fieldKind: singleNodeField.identifier,
			change: brand(undefined),
			revision: tag2,
		},
		{
			type: "field",
			field: pathA0A,
			fieldKind: valueField.identifier,
			change: brand(valueChange2),
			revision: tag2,
		},
		{
			type: "field",
			field: pathA0B,
			fieldKind: valueField.identifier,
			change: brand(valueChange1a),
			revision: tag2,
		},
	]),
);

const rootChange2Generic: ModularChangeset = removeAliases(
	mainEditor.buildChanges([
		{
			type: "field",
			field: pathA0A,
			fieldKind: valueField.identifier,
			change: brand(valueChange2),
			revision: tag2,
		},
		{
			type: "field",
			field: pathA0B,
			fieldKind: valueField.identifier,
			change: brand(valueChange1a),
			revision: tag2,
		},
	]),
);

const rootChange3: ModularChangeset = removeAliases(
	mainEditor.buildChanges([
		{
			type: "field",
			field: pathA,
			fieldKind: singleNodeField.identifier,
			change: brand(undefined),
			revision: tag3,
		},
		{
			type: "field",
			field: pathA0A,
			fieldKind: valueField.identifier,
			change: brand(valueChange1a),
			revision: tag3,
		},
	]),
);

const rootChange4: ModularChangeset = removeAliases(
	family.compose([
		tagChangeInline(rootChange3, tag4),
		makeAnonChange(buildExistsConstraint(pathA0)),
	]),
);

const dummyRevisionTag = mintRevisionTag();

const rootChangeWithoutNodeFieldChanges: ModularChangeset = family.compose([
	tagChangeInline(
		buildChangeset([
			{
				type: "field",
				field: pathA,
				fieldKind: singleNodeField.identifier,
				change: brand(undefined),
				revision: dummyRevisionTag,
			},
		]),
		dummyRevisionTag,
	),
	makeAnonChange(buildExistsConstraint(pathA0)),
]);

const node1 = singleJsonCursor(1);
const objectNode = singleJsonCursor({});
const node1Chunk = treeChunkFromCursor(node1);
const nodesChunk = chunkFieldSingle(fieldJsonCursor([{}, {}]), {
	policy: defaultChunkPolicy,
	idCompressor: testIdCompressor,
});

describe("ModularChangeFamily", () => {
	describe("compose", () => {
		const composedValues: ValueChangeset = { old: 0, new: 2 };

		const composedNodeChange: NodeChangeset = {
			fieldChanges: new Map([
				[
					fieldA,
					{
						fieldKind: valueField.identifier,
						change: brand(composedValues),
					},
				],
				[
					fieldB,
					{
						fieldKind: valueField.identifier,
						change: brand(valueChange1a),
					},
				],
			]),
		};

		it("prioritizes earlier build entries when faced with duplicates", () => {
			const change1: ModularChangeset = {
				...Change.empty(),
				builds: newTupleBTree([
					[[undefined as RevisionTag | undefined, brand(0)], node1Chunk],
				]),
			};
			const change2: ModularChangeset = {
				...Change.empty(),
				builds: newTupleBTree([
					[
						[undefined as RevisionTag | undefined, brand(0)],
						treeChunkFromCursor(singleJsonCursor(2)),
					],
				]),
			};

			assertEqual(family.compose([makeAnonChange(change1), makeAnonChange(change2)]), change1);
		});

		it("compose specific ○ specific", () => {
			const expectedRevision: RevisionInfo[] = [{ revision: tag1 }, { revision: tag2 }];
			const expectedCompose = {
				...tagChangeInline(
					Change.build(
						{ family, maxId: rootChange2.maxId },
						Change.field(
							fieldA,
							singleNodeField.identifier,
							singleNodeField.changeHandler.createEmpty(),
							Change.node(
								0,
								Change.field(fieldA, valueField.identifier, composedValues),
								Change.field(fieldB, valueField.identifier, valueChange1a),
							),
						),
						Change.field(fieldB, valueField.identifier, valueChange2),
					),
					tag1,
				).change,
				revisions: expectedRevision,
			};

			const composed = removeAliases(
				family.compose([makeAnonChange(rootChange1a), makeAnonChange(rootChange2)]),
			);

			assertEqual(composed, expectedCompose);
		});

		it("compose specific ○ generic", () => {
			const expectedRevision: RevisionInfo[] = [{ revision: tag1 }, { revision: tag2 }];
			const expectedCompose = {
				...tagChangeInline(
					Change.build(
						{ family, maxId: rootChange2Generic.maxId },
						Change.field(
							fieldA,
							singleNodeField.identifier,
							singleNodeField.changeHandler.createEmpty(),
							Change.node(
								0,
								Change.field(fieldA, valueField.identifier, composedValues),
								Change.field(fieldB, valueField.identifier, valueChange1a),
							),
						),
						Change.field(fieldB, valueField.identifier, valueChange2),
					),
					tag1,
				).change,
				revisions: expectedRevision,
			};

			const composed = removeAliases(
				family.compose([makeAnonChange(rootChange1a), makeAnonChange(rootChange2Generic)]),
			);

			assertEqual(composed, expectedCompose);
		});

		it("compose generic ○ specific", () => {
			const expectedRevision: RevisionInfo[] = [{ revision: tag1 }, { revision: tag2 }];
			const expectedCompose = {
				...tagChangeInline(
					Change.build(
						{ family, maxId: rootChange2.maxId },
						Change.field(
							fieldA,
							singleNodeField.identifier,
							singleNodeField.changeHandler.createEmpty(),
							Change.nodeWithId(
								0,
								{ localId: brand(1) },
								Change.field(fieldA, valueField.identifier, composedValues),
								Change.field(fieldB, valueField.identifier, valueChange1a),
							),
						),
						Change.field(fieldB, valueField.identifier, valueChange2),
					),
					tag1,
				).change,
				revisions: expectedRevision,
			};

			const composed = removeAliases(
				family.compose([makeAnonChange(rootChange1aGeneric), makeAnonChange(rootChange2)]),
			);

			assertEqual(composed, expectedCompose);
		});

		it("compose generic ○ generic", () => {
			const expectedRevision: RevisionInfo[] = [{ revision: tag1 }, { revision: tag2 }];
			const expectedCompose = {
				...tagChangeInline(
					Change.build(
						{ family, maxId: rootChange2Generic.maxId },
						Change.field(
							fieldA,
							genericFieldKind.identifier,
							genericFieldKind.changeHandler.createEmpty(),
							Change.nodeWithId(
								0,
								{ localId: brand(1) },
								Change.field(fieldA, valueField.identifier, composedValues),
								Change.field(fieldB, valueField.identifier, valueChange1a),
							),
						),
						Change.field(fieldB, valueField.identifier, valueChange2),
					),
					tag1,
				).change,
				revisions: expectedRevision,
			};

			const composed = removeAliases(
				family.compose([
					makeAnonChange(rootChange1aGeneric),
					makeAnonChange(rootChange2Generic),
				]),
			);

			assertEqual(composed, expectedCompose);
		});

		it("compose tagged changes", () => {
			const change1 = tagChangeInline(
				buildChangeset([
					{
						type: "field",
						field: pathA,
						fieldKind: valueField.identifier,
						change: brand(valueChange1a),
						revision: tag1,
					},
				]),
				tag1,
			);

			const change2 = tagChangeInline(
				buildChangeset([
					{
						type: "field",
						field: pathB,
						fieldKind: singleNodeField.identifier,
						change: brand(undefined),
						revision: tag2,
					},
					{
						type: "field",
						field: pathB0A,
						fieldKind: valueField.identifier,
						change: brand(valueChange2),
						revision: tag2,
					},
				]),
				tag2,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const nodeId: NodeId = { revision: tag2, localId: brand(0) };
			const expected = Change.build(
				{
					family,
					maxId: change2.change.maxId,
					revisions: [{ revision: tag1 }, { revision: tag2 }],
				},
				Change.field(fieldA, valueField.identifier, valueChange1a),
				Change.field(
					fieldB,
					singleNodeField.identifier,
					singleNodeField.changeHandler.createEmpty(),
					Change.nodeWithId(
						0,
						nodeId,
						Change.field(fieldA, valueField.identifier, valueChange2),
					),
				),
			);

			assertEqual(composed, expected);
		});

		it("build ○ matching destroy = ε", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					builds: newTupleBTree([
						[[undefined, brand(0)], node1Chunk],
						[[tag2, brand(0)], node1Chunk],
					]),
				},
				tag1,
			);

			const change2: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					destroys: newTupleBTree([
						[[tag1, brand(0)], 1],
						[[undefined, brand(0)], 1],
					]),
				},
				tag2,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expected: ModularChangeset = {
				...Change.empty(),
				revisions: [{ revision: tag1 }, { revision: tag2 }],
			};

			assertEqual(composed, expected);
		});

		it("destroy ○ matching build = ε", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					destroys: newTupleBTree([
						[[tag1, brand(0)], 1],
						[[undefined, brand(0)], 1],
					]),
				},
				tag2,
			);

			const change2: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					builds: newTupleBTree([
						[[undefined, brand(0)], node1Chunk],
						[[tag2, brand(0)], node1Chunk],
					]),
				},
				tag1,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expected: ModularChangeset = {
				...Change.empty(),
				revisions: [{ revision: tag2 }, { revision: tag1 }],
			};

			assertEqual(composed, expected);
		});

		it("non-matching builds and destroys", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					builds: newTupleBTree([
						[[undefined, brand(0)], treeChunkFromCursor(node1)],
						[[tag3, brand(0)], treeChunkFromCursor(node1)],
					]),
					destroys: newTupleBTree([
						[[undefined, brand(1)], 1],
						[[tag3, brand(1)], 1],
					]),
				},
				tag1,
			);

			const change2: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					builds: newTupleBTree([
						[[undefined, brand(2)], treeChunkFromCursor(node1)],
						[[tag3, brand(2)], treeChunkFromCursor(node1)],
					]),
					destroys: newTupleBTree([
						[[undefined, brand(3)], 1],
						[[tag3, brand(3)], 1],
					]),
				},
				tag2,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expected: ModularChangeset = {
				...Change.empty(),
				builds: newTupleBTree([
					[[tag1 as RevisionTag | undefined, brand(0)], treeChunkFromCursor(node1)],
					[[tag2, brand(2)], treeChunkFromCursor(node1)],
					[
						[
							tag3,

							brand(0),
						],
						treeChunkFromCursor(node1),
					],
					[[tag3, brand(2)], treeChunkFromCursor(node1)],
				]),
				destroys: newTupleBTree([
					[[tag1 as RevisionTag | undefined, brand(1)], 1],
					[[tag2, brand(3)], 1],
					[[tag3, brand(1)], 1],
					[[tag3, brand(3)], 1],
				]),
				revisions: [{ revision: tag1 }, { revision: tag2 }],
			};

			assertEqual(composed, expected);
		});

		it("refreshers", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					refreshers: newTupleBTree([
						[[tag3 as RevisionTag | undefined, brand(0)], treeChunkFromCursor(node1)],
					]),
				},
				tag1,
			);

			const change2: TaggedChange<ModularChangeset> = tagChange(
				{
					...Change.empty(),
					refreshers: newTupleBTree([
						[[undefined, brand(2)], treeChunkFromCursor(node1)],
						[[tag3, brand(2)], treeChunkFromCursor(node1)],
					]),
					revisions: [{ revision: tag2 }],
				},
				undefined,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expected: ModularChangeset = {
				...Change.empty(),
				refreshers: newTupleBTree([
					[[undefined, brand(2)], treeChunkFromCursor(node1)],
					[[tag3, brand(0)], treeChunkFromCursor(node1)],
					[[tag3, brand(2)], treeChunkFromCursor(node1)],
				]),
				revisions: [{ revision: tag1 }, { revision: tag2 }],
			};

			assertEqual(composed, expected);
		});

		it("refreshers with the same detached node id", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					refreshers: newTupleBTree([
						[[tag3 as RevisionTag | undefined, brand(0)], treeChunkFromCursor(node1)],
					]),
				},
				tag1,
			);

			const change2: TaggedChange<ModularChangeset> = tagChange(
				{
					...Change.empty(),
					refreshers: newTupleBTree([
						[[tag3 as RevisionTag | undefined, brand(0)], treeChunkFromCursor(objectNode)],
					]),
					revisions: [{ revision: tag2 }],
				},
				undefined,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expected: ModularChangeset = {
				...Change.empty(),
				refreshers: newTupleBTree([
					[[tag3 as RevisionTag | undefined, brand(0)], treeChunkFromCursor(node1)],
				]),
				revisions: [{ revision: tag1 }, { revision: tag2 }],
			};

			assertEqual(composed, expected);
		});
	});

	describe("invert", () => {
		const valueInverse1: ValueChangeset = { old: 1, new: 0 };
		const valueInverse2: ValueChangeset = { old: 2, new: 1 };

		it("specific", () => {
			const revisionForInvert = mintRevisionTag();
			const expectedInverse: ModularChangeset = {
				...buildChangeset([
					{
						type: "field",
						field: pathA,
						fieldKind: singleNodeField.identifier,
						change: brand(undefined),
						revision: tag1,
					},
					{
						type: "field",
						field: pathA0A,
						fieldKind: valueField.identifier,
						change: brand(valueInverse1),
						revision: tag1,
					},
					{
						type: "field",
						field: pathB,
						fieldKind: valueField.identifier,
						change: brand(valueInverse2),
						revision: tag1,
					},
				]),
				revisions: [{ revision: revisionForInvert }],
			};

			assertEqual(
				family.invert(makeAnonChange(rootChange1a), false, revisionForInvert),
				expectedInverse,
			);
		});

		it("generic", () => {
			const revisionForInvert = mintRevisionTag();
			const expectedInverse: ModularChangeset = {
				...tagChangeInline(
					Change.build(
						{ family, maxId: rootChange1aGeneric.maxId },
						Change.field(
							fieldA,
							genericFieldKind.identifier,
							genericFieldKind.changeHandler.createEmpty(),
							Change.nodeWithId(
								0,
								{ localId: brand(1) },
								Change.field(fieldA, valueField.identifier, valueInverse1),
							),
						),
						Change.field(fieldB, valueField.identifier, valueInverse2),
					),
					tag1,
				).change,
				revisions: [{ revision: revisionForInvert }],
			};

			assertEqual(
				family.invert(makeAnonChange(rootChange1aGeneric), false, revisionForInvert),
				expectedInverse,
			);
		});

		it("build => destroy but only for rollback", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					builds: newTupleBTree([
						[[undefined, brand(0)], node1Chunk],
						[[tag2, brand(1)], node1Chunk],
					]),
				},
				tag1,
			);
			deepFreeze(change1);
			const revisionForInvert = mintRevisionTag();
			const actualRollback = family.invert(change1, true, revisionForInvert);
			const actualUndo = family.invert(change1, false, revisionForInvert);

			actualRollback.crossFieldKeys.unfreeze();
			actualUndo.crossFieldKeys.unfreeze();

			const expectedRollback: ModularChangeset = {
				...Change.empty(),
				destroys: newTupleBTree([
					[[tag1 as RevisionTag | undefined, brand(0)], 1],
					[[tag2, brand(1)], 1],
				]),
				revisions: [{ revision: revisionForInvert, rollbackOf: tag1 }],
			};
			const expectedUndo: ModularChangeset = tagChangeInline(
				Change.empty(),
				revisionForInvert,
			).change;

			assertEqual(actualRollback, expectedRollback);
			assertEqual(actualUndo, expectedUndo);
		});
	});

	describe("rebase", () => {
		it("rebase specific ↷ specific", () => {
			const rebased = family.rebase(
				makeAnonChange(rootChange1b),
				makeAnonChange(rootChange1a),
				revisionMetadataSourceFromInfo([]),
			);
			const tagForCompare = mintRevisionTag();
			assertEqual(
				tagChangeInline(rebased, tagForCompare),
				tagChangeInline(rebasedChange, tagForCompare),
			);
		});

		it("rebase specific ↷ generic", () => {
			const rebased = family.rebase(
				makeAnonChange(rootChange1b),
				makeAnonChange(rootChange1aGeneric),
				revisionMetadataSourceFromInfo([]),
			);
			const tagForCompare = mintRevisionTag();
			assertEqual(
				tagChangeInline(rebased, tagForCompare),
				tagChangeInline(rebasedChange, tagForCompare),
			);
		});

		it("rebase generic ↷ specific", () => {
			const rebased = family.rebase(
				makeAnonChange(rootChange1bGeneric),
				makeAnonChange(rootChange1a),
				revisionMetadataSourceFromInfo([]),
			);
			const tagForCompare = mintRevisionTag();
			assertEqual(
				tagChangeInline(rebased, tagForCompare),
				tagChangeInline(genericChangeRebasedOverSpecific, tagForCompare),
			);
		});

		it("rebase generic ↷ generic", () => {
			const rebased = family.rebase(
				makeAnonChange(rootChange1bGeneric),
				makeAnonChange(rootChange1aGeneric),
				revisionMetadataSourceFromInfo([]),
			);
			const tagForCompare = mintRevisionTag();
			assertEqual(
				tagChangeInline(rebased, tagForCompare),
				tagChangeInline(rebasedChangeGeneric, tagForCompare),
			);
		});
	});

	describe("intoDelta", () => {
		it("fieldChanges", () => {
			const nodeDelta: DeltaFieldChanges = {
				local: [
					{
						count: 1,
						fields: new Map([
							[
								fieldA,
								{
									local: [{ count: 1, detach: { minor: 0 }, attach: { minor: 1 } }],
								},
							],
						]),
					},
				],
			};

			const expectedDelta: DeltaRoot = {
				fields: new Map([
					[fieldA, nodeDelta],
					[fieldB, { local: [{ count: 1, detach: { minor: 1 }, attach: { minor: 2 } }] }],
				]),
			};

			const actual = intoDelta(makeAnonChange(rootChange1a), family.fieldKinds);
			assertDeltaEqual(actual, expectedDelta);
		});

		it("builds", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					builds: newTupleBTree([
						[[undefined, brand(1)], node1Chunk],
						[
							[
								tag2,

								brand(2),
							],
							node1Chunk,
						],
						[[tag2, brand(3)], nodesChunk],
					]),
				},
				tag1,
			);

			const expectedDelta: DeltaRoot = {
				build: [
					{ id: { major: tag1, minor: 1 }, trees: [node1] },
					{ id: { major: tag2, minor: 2 }, trees: [node1] },
					{ id: { major: tag2, minor: 3 }, trees: [objectNode, objectNode] },
				],
			};

			const actual = intoDelta(change1, family.fieldKinds);
			assertDeltaEqual(actual, expectedDelta);
		});

		it("destroys", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					destroys: newTupleBTree([
						[[undefined, brand(1)], 1],
						[[tag2, brand(2)], 1],
						[[tag2, brand(3)], 10],
					]),
				},
				tag1,
			);

			const expectedDelta: DeltaRoot = {
				destroy: [
					{ id: { major: tag1, minor: 1 }, count: 1 },
					{ id: { major: tag2, minor: 2 }, count: 1 },
					{ id: { major: tag2, minor: 3 }, count: 10 },
				],
			};

			const actual = intoDelta(change1, family.fieldKinds);
			assertDeltaEqual(actual, expectedDelta);
		});

		it("refreshers", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					...Change.empty(),
					refreshers: newTupleBTree([
						[[undefined, brand(1)], node1Chunk],
						[[tag2, brand(2)], node1Chunk],
						[[tag2, brand(3)], nodesChunk],
					]),
				},
				tag1,
			);

			const expectedDelta: DeltaRoot = {
				refreshers: [
					{ id: { major: tag1, minor: 1 }, trees: [node1] },
					{ id: { major: tag2, minor: 2 }, trees: [node1] },
					{ id: { major: tag2, minor: 3 }, trees: [objectNode, objectNode] },
				],
			};

			const actual = intoDelta(change1, family.fieldKinds);
			assertDeltaEqual(actual, expectedDelta);
		});
	});

	describe("relevantRemovedRoots", () => {
		const fieldKind: FieldKindIdentifier = brand("HasRemovedRootsRefs");
		interface HasRemovedRootsRefs {
			shallow: DeltaDetachedNodeId[];
			nested: NodeId[];
		}

		const handler: FieldChangeHandler<
			HasRemovedRootsRefs,
			FieldEditor<HasRemovedRootsRefs>
		> = {
			relevantRemovedRoots: (
				change: HasRemovedRootsRefs,
				relevantRemovedRootsFromChild: RelevantRemovedRootsFromChild,
			) => {
				return [
					...change.shallow.map((id) => makeDetachedNodeId(id.major, id.minor)),
					...change.nested.flatMap((c) => Array.from(relevantRemovedRootsFromChild(c))),
				];
			},
		} as unknown as FieldChangeHandler<HasRemovedRootsRefs, FieldEditor<HasRemovedRootsRefs>>;
		const hasRemovedRootsRefsField = new FieldKindWithEditor(
			fieldKind,
			Multiplicity.Single,
			handler,
			() => false,
			new Set(),
		);
		const mockFieldKinds = new Map([[fieldKind, hasRemovedRootsRefsField]]);

		function relevantRemovedRoots(input: ModularChangeset): DeltaDetachedNodeId[] {
			deepFreeze(input);
			return Array.from(relevantDetachedTreesImplementation(input, mockFieldKinds));
		}

		function nodeChangeFromHasRemovedRootsRefs(changeset: HasRemovedRootsRefs): NodeChangeset {
			return {
				fieldChanges: new Map([[fieldA, { fieldKind, change: brand(changeset) }]]),
			};
		}

		it("sibling fields", () => {
			const aMajor = mintRevisionTag();
			const a1 = { major: aMajor, minor: 1 };
			const a2 = { major: aMajor, minor: 2 };
			const bMajor = mintRevisionTag();
			const b1 = { major: bMajor, minor: 1 };

			const changeA: HasRemovedRootsRefs = {
				shallow: [a1, a2],
				nested: [],
			};
			const changeB: HasRemovedRootsRefs = {
				shallow: [b1],
				nested: [],
			};
			const input: ModularChangeset = {
				...Change.empty(),
				fieldChanges: new Map([
					[brand("fA"), { fieldKind, change: brand(changeA) }],
					[brand("fB"), { fieldKind, change: brand(changeB) }],
				]),
			};

			const actual = relevantRemovedRoots(input);
			assertEqual(actual, [a1, a2, b1]);
		});

		it("nested fields", () => {
			const aMajor = mintRevisionTag();
			const cMajor = mintRevisionTag();
			const a1 = { major: aMajor, minor: 1 };
			const c1 = { major: cMajor, minor: 1 };

			const changeC: HasRemovedRootsRefs = {
				shallow: [c1],
				nested: [],
			};

			const changeB: HasRemovedRootsRefs = {
				shallow: [],
				nested: [nodeId2],
			};

			const changeA: HasRemovedRootsRefs = {
				shallow: [a1],
				nested: [nodeId1],
			};

			const input: ModularChangeset = {
				...Change.empty(),
				nodeChanges: newTupleBTree([
					[[nodeId1.revision, nodeId1.localId], nodeChangeFromHasRemovedRootsRefs(changeB)],
					[[nodeId2.revision, nodeId2.localId], nodeChangeFromHasRemovedRootsRefs(changeC)],
				]),
				fieldChanges: new Map([[brand("fA"), { fieldKind, change: brand(changeA) }]]),
			};

			const actual = relevantRemovedRoots(input);
			assertEqual(actual, [a1, c1]);
		});
	});

	describe("update refreshers", () => {
		const aMajor = mintRevisionTag();
		const a1 = { major: aMajor, minor: 1 };
		const a2 = { major: aMajor, minor: 2 };
		const bMajor = mintRevisionTag();
		const b1 = { major: bMajor, minor: 1 };

		const node2 = singleJsonCursor(2);
		const node2Chunk = treeChunkFromCursor(node2);
		const node3 = singleJsonCursor(3);
		const node3Chunk = treeChunkFromCursor(node3);

		const nodesArray: [DeltaDetachedNodeId, TreeChunk][] = [
			[a1, node1Chunk],
			[a2, node2Chunk],
			[b1, node3Chunk],
		];
		const nodeMap = nestedMapFromFlatList(
			nodesArray.map(([{ major, minor }, chunk]) => [major, minor, chunk]),
		);

		const getDetachedNode = ({ major, minor }: DeltaDetachedNodeId) => {
			return tryGetFromNestedMap(nodeMap, major, minor);
		};

		it("preserves relevant refreshers that are present in the input", () => {
			const input: ModularChangeset = {
				...Change.empty(),
				refreshers: newTupleBTree([
					[[aMajor as RevisionTag | undefined, brand(2)], node2Chunk],
				]),
			};

			const expected: ModularChangeset = {
				...Change.empty(),
				refreshers: newTupleBTree([
					[[aMajor as RevisionTag | undefined, brand(2)], node2Chunk],
				]),
			};

			const withBuilds = updateRefreshers(input, getDetachedNode, [a2]);
			assertEqual(withBuilds, expected);
		});

		it("removes irrelevant refreshers that are present in the input", () => {
			const input: ModularChangeset = {
				...Change.empty(),
				refreshers: newTupleBTree([
					[[aMajor as RevisionTag | undefined, brand(1)], node1Chunk],
					[[aMajor, brand(2)], node2Chunk],
					[[bMajor, brand(1)], node3Chunk],
				]),
			};

			const expected: ModularChangeset = Change.empty();
			const filtered = updateRefreshers(input, getDetachedNode, []);
			assertEqual(filtered, expected);
		});

		it("recognizes chunks in the builds array with length longer than one", () => {
			assert.equal(nodesChunk.topLevelLength, 2);
			const input: ModularChangeset = {
				...Change.empty(),
				builds: newTupleBTree([[[aMajor as RevisionTag | undefined, brand(3)], nodesChunk]]),
			};

			const expected: ModularChangeset = {
				...Change.empty(),
				builds: newTupleBTree([[[aMajor as RevisionTag | undefined, brand(3)], nodesChunk]]),
			};

			const withBuilds = updateRefreshers(input, getDetachedNode, [
				{ major: aMajor, minor: 4 },
			]);
			assertEqual(withBuilds, expected);
		});

		describe("attempts to add relevant refreshers that are missing from the input", () => {
			it("adds the missing refresher if the detached node is available", () => {
				const input: ModularChangeset = Change.empty();

				const expected: ModularChangeset = {
					...Change.empty(),
					refreshers: newTupleBTree([
						[[aMajor as RevisionTag | undefined, brand(1)], node1Chunk],
						[[aMajor, brand(2)], node2Chunk],
						[[bMajor, brand(1)], node3Chunk],
					]),
				};

				const withBuilds = updateRefreshers(input, getDetachedNode, [a1, a2, b1]);
				assertEqual(withBuilds, expected);
			});

			it("replaces outdated refreshers", () => {
				const input: ModularChangeset = {
					...Change.empty(),
					refreshers: newTupleBTree([
						[[aMajor as RevisionTag | undefined, brand(1)], node2Chunk],
						[[aMajor, brand(2)], node1Chunk],
					]),
				};

				const expected: ModularChangeset = {
					...Change.empty(),
					refreshers: newTupleBTree([
						[[aMajor as RevisionTag | undefined, brand(1)], node1Chunk],
						[[aMajor, brand(2)], node2Chunk],
					]),
				};

				const filtered = updateRefreshers(input, getDetachedNode, [a1, a2]);
				assertEqual(filtered, expected);
			});

			it("does not add a refresher that is present in the builds", () => {
				const input: ModularChangeset = {
					...Change.empty(),
					builds: newTupleBTree([
						[[aMajor as RevisionTag | undefined, brand(1)], node1Chunk],
						[[aMajor, brand(2)], node2Chunk],
						[[bMajor, brand(1)], node3Chunk],
					]),
				};

				const expected: ModularChangeset = {
					...Change.empty(),
					builds: newTupleBTree([
						[[aMajor as RevisionTag | undefined, brand(1)], node1Chunk],
						[[aMajor, brand(2)], node2Chunk],
						[[bMajor, brand(1)], node3Chunk],
					]),
				};

				const withBuilds = updateRefreshers(input, getDetachedNode, [a1, a2, b1]);
				assertEqual(withBuilds, expected);
			});

			it("throws if the detached node is not available and requireRefreshers is true", () => {
				const input: ModularChangeset = Change.empty();
				assert.throws(() => updateRefreshers(input, getDetachedNode, [{ minor: 2 }]));
			});
		});
	});

	describe("Encoding", () => {
		function assertEquivalent(change1: ModularChangeset, change2: ModularChangeset) {
			const normalized1 = normalizeChangeset(change1);
			const normalized2 = normalizeChangeset(change2);
			assertEqual(normalized1, normalized2);
		}

		const sessionId = "session1" as SessionId;
		const context: ChangeEncodingContext = {
			originatorId: sessionId,
			revision: tag1,
			idCompressor: testIdCompressor,
		};
		const encodingTestData: EncodingTestData<
			ModularChangeset,
			EncodedModularChangeset,
			ChangeEncodingContext
		> = {
			successes: [
				["without constraint", inlineRevision(rootChange1a, tag1), context],
				["with constraint", inlineRevision(rootChange3, tag1), context],
				[
					"with violated constraint",
					inlineRevision({ ...buildChangeset([]), constraintViolationCount: 42 }, tag1),
					context,
				],
				[
					"with builds",
					inlineRevision(
						{
							...buildChangeset([]),
							builds: newTupleBTree([
								[[undefined, brand(1)], node1Chunk],
								[[tag2, brand(2)], nodesChunk],
							]),
						},
						tag1,
					),
					context,
				],
				[
					"with refreshers",
					inlineRevision(
						{
							...buildChangeset([]),
							refreshers: newTupleBTree([
								[[undefined, brand(1)], node1Chunk],
								[[tag2, brand(2)], nodesChunk],
							]),
						},
						tag1,
					),
					context,
				],
				["with node existence constraint", inlineRevision(rootChange4, tag1), context],
				[
					"without node field changes",
					inlineRevision(rootChangeWithoutNodeFieldChanges, tag1),
					context,
				],
			],
		};

		makeEncodingTestSuite(family.codecs, encodingTestData, assertEquivalent);
	});

	it("build child change", () => {
		const [changeReceiver, getChanges] = testChangeReceiver(family);
		const editor = family.buildEditor(changeReceiver);
		const path: UpPath = {
			parent: undefined,
			parentField: fieldA,
			parentIndex: 0,
		};

		editor.submitChange(
			{ parent: path, field: fieldB },
			valueField.identifier,
			brand(valueChange1a),
			tag1,
		);
		const changes = getChanges();

		const expectedChange = tagChangeInline(
			Change.build(
				{ family, maxId: 0 },
				Change.field(
					fieldA,
					genericFieldKind.identifier,
					genericFieldKind.changeHandler.createEmpty(),
					Change.node(0, Change.field(fieldB, valueField.identifier, valueChange1a)),
				),
			),
			tag1,
		);

		assertEqual(changes, [expectedChange.change]);
	});
});

function treeChunkFromCursor(cursor: ITreeCursorSynchronous): TreeChunk {
	return chunkTree(cursor, { policy: defaultChunkPolicy, idCompressor: testIdCompressor });
}

function deepCloneChunkedTree(chunk: TreeChunk): TreeChunk {
	const jsonable = jsonableTreeFromFieldCursor(chunk.cursor());
	const cursor = cursorForJsonableTreeField(jsonable);
	const clone = chunkFieldSingle(cursor, {
		policy: defaultChunkPolicy,
		idCompressor: testIdCompressor,
	});
	return clone;
}

function normalizeChangeset(change: ModularChangeset): ModularChangeset {
	const idAllocator = idAllocatorFromMaxId();

	const idRemappings: ChangeAtomIdMap<NodeId> = new Map();
	const nodeChanges: ChangeAtomIdBTree<NodeChangeset> = newTupleBTree();
	const nodeToParent: ChangeAtomIdBTree<FieldId> = newTupleBTree();
	const crossFieldKeyTable: CrossFieldKeyTable = newCrossFieldKeyTable();

	const remapNodeId = (nodeId: NodeId): NodeId => {
		const newId = tryGetFromNestedMap(idRemappings, nodeId.revision, nodeId.localId);
		assert(newId !== undefined, "Unknown node ID");
		return newId;
	};

	const remapFieldId = (fieldId: FieldId): FieldId => {
		return fieldId.nodeId === undefined
			? fieldId
			: { ...fieldId, nodeId: remapNodeId(fieldId.nodeId) };
	};

	const normalizeNodeChanges = (nodeId: NodeId): NodeId => {
		const nodeChangeset = change.nodeChanges.get([nodeId.revision, nodeId.localId]);
		assert(nodeChangeset !== undefined, "Unknown node ID");

		const normalizedNodeChangeset: NodeChangeset = { ...nodeChangeset };
		if (normalizedNodeChangeset.fieldChanges !== undefined) {
			normalizedNodeChangeset.fieldChanges = normalizeFieldChanges(
				normalizedNodeChangeset.fieldChanges,
			);
		}

		const newId: NodeId = { localId: brand(idAllocator.allocate()) };
		setInNestedMap(idRemappings, nodeId.revision, nodeId.localId, newId);
		nodeChanges.set([newId.revision, newId.localId], normalizedNodeChangeset);

		const parent = change.nodeToParent.get([nodeId.revision, nodeId.localId]);
		assert(parent !== undefined, "Every node should have a parent");
		const newParent = remapFieldId(parent);
		nodeToParent.set([newId.revision, newId.localId], newParent);

		return newId;
	};

	function normalizeFieldChanges(fields: FieldChangeMap): FieldChangeMap {
		const normalizedFieldChanges: FieldChangeMap = new Map();

		for (const [field, fieldChange] of fields) {
			const changeHandler = getFieldKind(fieldKinds, fieldChange.fieldKind).changeHandler;

			// TODO: This relies on field kinds calling prune child on all changes,
			// while pruning is supposed to be an optimization which could be skipped.
			normalizedFieldChanges.set(
				field,
				changeHandler.rebaser.prune(fieldChange.change, normalizeNodeChanges),
			);

			const crossFieldKeys = changeHandler.getCrossFieldKeys(fieldChange.change);
			for (const key of crossFieldKeys) {
				const prevId = change.crossFieldKeys.get(key);
				assert(prevId !== undefined, "Should be an entry for each cross-field key");
				crossFieldKeyTable.set(key, remapFieldId(prevId));
			}
		}

		return normalizedFieldChanges;
	}

	const fieldChanges = normalizeFieldChanges(change.fieldChanges);
	assert(nodeChanges.size === change.nodeChanges.size);

	const normal: Mutable<ModularChangeset> = {
		...change,
		nodeChanges,
		fieldChanges,
		nodeToParent,
		crossFieldKeys: crossFieldKeyTable,
	};

	// The TreeChunk objects need to be deep cloned to avoid comparison issues on reference counting
	if (change.builds !== undefined) {
		normal.builds = brand(change.builds.mapValues(deepCloneChunkedTree));
	}
	if (change.refreshers !== undefined) {
		normal.refreshers = brand(change.refreshers.mapValues(deepCloneChunkedTree));
	}
	return normal;
}

function inlineRevision(change: ModularChangeset, revision: RevisionTag): ModularChangeset {
	return family.changeRevision(change, revision);
}

function tagChangeInline(
	change: ModularChangeset,
	revision: RevisionTag,
): TaggedChange<ModularChangeset> {
	return tagChange(inlineRevision(change, revision), revision);
}

function deepFreeze(object: object) {
	deepFreezeBase(object, (obj) => {
		if (obj instanceof BTree) {
			obj.freeze();
			return false;
		}
		return true;
	});
}

function buildChangeset(edits: EditDescription[]): ModularChangeset {
	const editor = family.buildEditor(() => undefined);
	return editor.buildChanges(edits);
}

function buildExistsConstraint(path: UpPath): ModularChangeset {
	const edits: ModularChangeset[] = [];
	const editor = family.buildEditor((taggedChange) => edits.push(taggedChange.change));
	editor.addNodeExistsConstraint(path, mintRevisionTag());
	return edits[0];
}
