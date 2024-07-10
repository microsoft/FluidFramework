/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

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
} from "../../../core/index.js";
import {
	type Mutable,
	brand,
	idAllocatorFromMaxId,
	nestedMapFromFlatList,
	setInNestedMap,
	tryGetFromNestedMap,
	mapNestedMap,
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
import { jsonObject, singleJsonCursor } from "../../../domains/index.js";
import type {
	FieldChangeMap,
	NodeChangeset,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeTypes.js";
import {
	getFieldKind,
	intoDelta,
	updateRefreshers,
	relevantRemovedRoots as relevantDetachedTreesImplementation,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import type {
	EncodedNodeChangeset,
	FieldChangeEncodingContext,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";

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
	getNestedChanges: (change) => (change === undefined ? [] : [[change, 0]]),
	createEmpty: () => undefined,
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

const rootChange1a = buildChangeset([
	{
		type: "field",
		field: pathA,
		fieldKind: singleNodeField.identifier,
		change: brand(undefined),
	},
	{
		type: "field",
		field: pathA0A,
		fieldKind: valueField.identifier,
		change: brand(valueChange1a),
	},
	{
		type: "field",
		field: pathB,
		fieldKind: valueField.identifier,
		change: brand(valueChange2),
	},
]);

const rootChange1aGeneric: ModularChangeset = buildChangeset([
	{
		type: "field",
		field: pathA0A,
		fieldKind: valueField.identifier,
		change: brand(valueChange1a),
	},
	{
		type: "field",
		field: pathB,
		fieldKind: valueField.identifier,
		change: brand(valueChange2),
	},
]);

const rootChange1b: ModularChangeset = buildChangeset([
	{
		type: "field",
		field: pathA,
		fieldKind: singleNodeField.identifier,
		change: brand(undefined),
	},
	{
		type: "field",
		field: pathA0A,
		fieldKind: valueField.identifier,
		change: brand(valueChange1b),
	},
	{
		type: "field",
		field: pathA0B,
		fieldKind: valueField.identifier,
		change: brand(valueChange1a),
	},
]);

const rootChange1bGeneric: ModularChangeset = buildChangeset([
	{
		type: "field",
		field: pathA0A,
		fieldKind: valueField.identifier,
		change: brand(valueChange1b),
	},
	{
		type: "field",
		field: pathA0B,
		fieldKind: valueField.identifier,
		change: brand(valueChange1a),
	},
]);

const rebasedChange: ModularChangeset = buildChangeset([
	{
		type: "field",
		field: pathA,
		fieldKind: singleNodeField.identifier,
		change: brand(undefined),
	},
	{
		type: "field",
		field: pathA0A,
		fieldKind: valueField.identifier,
		change: brand(valueChange2),
	},
	{
		type: "field",
		field: pathA0B,
		fieldKind: valueField.identifier,
		change: brand(valueChange1a),
	},
]);

const rebasedChangeGeneric: ModularChangeset = buildChangeset([
	{
		type: "field",
		field: pathA0A,
		fieldKind: valueField.identifier,
		change: brand(valueChange2),
	},
	{
		type: "field",
		field: pathA0B,
		fieldKind: valueField.identifier,
		change: brand(valueChange1a),
	},
]);

const rootChange2: ModularChangeset = buildChangeset([
	{
		type: "field",
		field: pathA,
		fieldKind: singleNodeField.identifier,
		change: brand(undefined),
	},
	{
		type: "field",
		field: pathA0A,
		fieldKind: valueField.identifier,
		change: brand(valueChange2),
	},
	{
		type: "field",
		field: pathA0B,
		fieldKind: valueField.identifier,
		change: brand(valueChange1a),
	},
]);

const rootChange2Generic: ModularChangeset = buildChangeset([
	{
		type: "field",
		field: pathA0A,
		fieldKind: valueField.identifier,
		change: brand(valueChange2),
	},
	{
		type: "field",
		field: pathA0B,
		fieldKind: valueField.identifier,
		change: brand(valueChange1a),
	},
]);

const rootChange3: ModularChangeset = buildChangeset([
	{
		type: "field",
		field: pathA,
		fieldKind: singleNodeField.identifier,
		change: brand(undefined),
	},
	{
		type: "field",
		field: pathA0A,
		fieldKind: valueField.identifier,
		change: brand(valueChange1a),
	},
]);

const rootChange4: ModularChangeset = family.compose([
	tagChangeInline(rootChange3, tag1),
	makeAnonChange(buildExistsConstraint(pathA0)),
]);

const dummyRevisionTag = mintRevisionTag();

const rootChangeWithoutNodeFieldChanges: ModularChangeset = family.compose([
	tagChangeInline(
		buildChangeset([
			{
				type: "field",
				field: pathA,
				fieldKind: singleNodeField.identifier,
				change: brand(undefined),
			},
		]),
		dummyRevisionTag,
	),
	makeAnonChange(buildExistsConstraint(pathA0)),
]);

const node1 = singleJsonCursor(1);
const objectNode = singleJsonCursor({});
const node1Chunk = treeChunkFromCursor(node1);
const nodesChunk = chunkFieldSingle(
	cursorForJsonableTreeField([{ type: jsonObject.name }, { type: jsonObject.name }]),
	defaultChunkPolicy,
);

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
				nodeChanges: new Map(),
				fieldChanges: new Map(),
				builds: new Map([[undefined, new Map([[brand(0), node1Chunk]])]]),
			};
			const change2: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map(),
				builds: new Map([
					[undefined, new Map([[brand(0), treeChunkFromCursor(singleJsonCursor(2))]])],
				]),
			};
			assert.deepEqual(
				family.compose([makeAnonChange(change1), makeAnonChange(change2)]),
				change1,
			);
		});

		it("compose specific ○ specific", () => {
			const expectedCompose = buildChangeset([
				{
					type: "field",
					field: pathA,
					fieldKind: singleNodeField.identifier,
					change: brand(undefined),
				},
				{
					type: "field",
					field: pathA0A,
					fieldKind: valueField.identifier,
					change: brand(composedValues),
				},
				{
					type: "field",
					field: pathA0B,
					fieldKind: valueField.identifier,
					change: brand(valueChange1a),
				},
				{
					type: "field",
					field: pathB,
					fieldKind: valueField.identifier,
					change: brand(valueChange2),
				},
			]);

			const composed = family.compose([
				makeAnonChange(rootChange1a),
				makeAnonChange(rootChange2),
			]);

			assert.deepEqual(composed, expectedCompose);
		});

		it("compose specific ○ generic", () => {
			const expectedCompose = buildChangeset([
				{
					type: "field",
					field: pathA,
					fieldKind: singleNodeField.identifier,
					change: brand(undefined),
				},
				{
					type: "field",
					field: pathA0A,
					fieldKind: valueField.identifier,
					change: brand(composedValues),
				},
				{
					type: "field",
					field: pathA0B,
					fieldKind: valueField.identifier,
					change: brand(valueChange1a),
				},
				{
					type: "field",
					field: pathB,
					fieldKind: valueField.identifier,
					change: brand(valueChange2),
				},
			]);

			assert.deepEqual(
				family.compose([makeAnonChange(rootChange1a), makeAnonChange(rootChange2Generic)]),
				expectedCompose,
			);
		});

		it("compose generic ○ specific", () => {
			const expectedCompose = buildChangeset([
				{
					type: "field",
					field: pathA,
					fieldKind: singleNodeField.identifier,
					change: brand(undefined),
				},
				{
					type: "field",
					field: pathA0A,
					fieldKind: valueField.identifier,
					change: brand(composedValues),
				},
				{
					type: "field",
					field: pathA0B,
					fieldKind: valueField.identifier,
					change: brand(valueChange1a),
				},
				{
					type: "field",
					field: pathB,
					fieldKind: valueField.identifier,
					change: brand(valueChange2),
				},
			]);

			assert.deepEqual(
				family.compose([makeAnonChange(rootChange1aGeneric), makeAnonChange(rootChange2)]),
				expectedCompose,
			);
		});

		it("compose generic ○ generic", () => {
			const expectedCompose = buildChangeset([
				{
					type: "field",
					field: pathA0A,
					fieldKind: valueField.identifier,
					change: brand(composedValues),
				},
				{
					type: "field",
					field: pathA0B,
					fieldKind: valueField.identifier,
					change: brand(valueChange1a),
				},
				{
					type: "field",
					field: pathB,
					fieldKind: valueField.identifier,
					change: brand(valueChange2),
				},
			]);

			assert.deepEqual(
				family.compose([
					makeAnonChange(rootChange1aGeneric),
					makeAnonChange(rootChange2Generic),
				]),
				expectedCompose,
			);
		});

		it("compose tagged changes", () => {
			const change1 = tagChangeInline(
				buildChangeset([
					{
						type: "field",
						field: pathA,
						fieldKind: valueField.identifier,
						change: brand(valueChange1a),
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
					},
					{
						type: "field",
						field: pathB0A,
						fieldKind: valueField.identifier,
						change: brand(valueChange2),
					},
				]),
				tag2,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expectedNodeChange: NodeChangeset = {
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};

			const nodeId: NodeId = { revision: tag2, localId: brand(0) };
			const expected: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[nodeId.revision, nodeId.localId, expectedNodeChange],
				]),
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: valueField.identifier,
							change: brand(valueChange1a),
						},
					],
					[
						fieldB,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(nodeId),
						},
					],
				]),
				revisions: [{ revision: tag1 }, { revision: tag2 }],
				maxId: brand(0),
			};

			assert.deepEqual(composed, expected);
		});

		it("build ○ matching destroy = ε", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					builds: new Map([
						[undefined, new Map([[brand(0), node1Chunk]])],
						[tag2, new Map([[brand(0), node1Chunk]])],
					]),
				},
				tag1,
			);

			const change2: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					destroys: new Map([
						[tag1, new Map([[brand(0), 1]])],
						[undefined, new Map([[brand(0), 1]])],
					]),
				},
				tag2,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expected: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map(),
				revisions: [{ revision: tag1 }, { revision: tag2 }],
			};

			assert.deepEqual(composed, expected);
		});

		it("destroy ○ matching build = ε", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					destroys: new Map([
						[tag1, new Map([[brand(0), 1]])],
						[undefined, new Map([[brand(0), 1]])],
					]),
				},
				tag2,
			);

			const change2: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					builds: new Map([
						[undefined, new Map([[brand(0), node1Chunk]])],
						[tag2, new Map([[brand(0), node1Chunk]])],
					]),
				},
				tag1,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expected: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map(),
				revisions: [{ revision: tag2 }, { revision: tag1 }],
			};

			assert.deepEqual(composed, expected);
		});

		it("non-matching builds and destroys", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					builds: new Map([
						[undefined, new Map([[brand(0), treeChunkFromCursor(node1)]])],
						[tag3, new Map([[brand(0), treeChunkFromCursor(node1)]])],
					]),
					destroys: new Map([
						[undefined, new Map([[brand(1), 1]])],
						[tag3, new Map([[brand(1), 1]])],
					]),
				},
				tag1,
			);

			const change2: TaggedChange<ModularChangeset> = tagChange(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					builds: new Map([
						[undefined, new Map([[brand(2), treeChunkFromCursor(node1)]])],
						[tag3, new Map([[brand(2), treeChunkFromCursor(node1)]])],
					]),
					destroys: new Map([
						[undefined, new Map([[brand(3), 1]])],
						[tag3, new Map([[brand(3), 1]])],
					]),
					revisions: [{ revision: tag2 }],
				},
				undefined,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expected: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map(),
				builds: new Map([
					[tag1, new Map([[brand(0), treeChunkFromCursor(node1)]])],
					[tag2, new Map([[brand(2), treeChunkFromCursor(node1)]])],
					[
						tag3,
						new Map([
							[brand(0), treeChunkFromCursor(node1)],
							[brand(2), treeChunkFromCursor(node1)],
						]),
					],
				]),
				destroys: new Map([
					[tag1, new Map([[brand(1), 1]])],
					[tag2, new Map([[brand(3), 1]])],
					[
						tag3,
						new Map([
							[brand(1), 1],
							[brand(3), 1],
						]),
					],
				]),
				revisions: [{ revision: tag1 }, { revision: tag2 }],
			};

			assert.deepEqual(composed, expected);
		});

		it("refreshers", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					refreshers: new Map([[tag3, new Map([[brand(0), treeChunkFromCursor(node1)]])]]),
				},
				tag1,
			);

			const change2: TaggedChange<ModularChangeset> = tagChange(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					refreshers: new Map([
						[undefined, new Map([[brand(2), treeChunkFromCursor(node1)]])],
						[tag3, new Map([[brand(2), treeChunkFromCursor(node1)]])],
					]),
					revisions: [{ revision: tag2 }],
				},
				undefined,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expected: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map(),
				refreshers: new Map([
					[undefined, new Map([[brand(2), treeChunkFromCursor(node1)]])],
					[
						tag3,
						new Map([
							[brand(0), treeChunkFromCursor(node1)],
							[brand(2), treeChunkFromCursor(node1)],
						]),
					],
				]),
				revisions: [{ revision: tag1 }, { revision: tag2 }],
			};

			assert.deepEqual(composed, expected);
		});

		it("refreshers with the same detached node id", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					refreshers: new Map([[tag3, new Map([[brand(0), treeChunkFromCursor(node1)]])]]),
				},
				tag1,
			);

			const change2: TaggedChange<ModularChangeset> = tagChange(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					refreshers: new Map([
						[tag3, new Map([[brand(0), treeChunkFromCursor(objectNode)]])],
					]),
					revisions: [{ revision: tag2 }],
				},
				undefined,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expected: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map(),
				refreshers: new Map([[tag3, new Map([[brand(0), treeChunkFromCursor(node1)]])]]),
				revisions: [{ revision: tag1 }, { revision: tag2 }],
			};

			assert.deepEqual(composed, expected);
		});
	});

	describe("invert", () => {
		const valueInverse1: ValueChangeset = { old: 1, new: 0 };
		const valueInverse2: ValueChangeset = { old: 2, new: 1 };

		it("specific", () => {
			const expectedInverse = buildChangeset([
				{
					type: "field",
					field: pathA,
					fieldKind: singleNodeField.identifier,
					change: brand(undefined),
				},
				{
					type: "field",
					field: pathA0A,
					fieldKind: valueField.identifier,
					change: brand(valueInverse1),
				},
				{
					type: "field",
					field: pathB,
					fieldKind: valueField.identifier,
					change: brand(valueInverse2),
				},
			]);

			assert.deepEqual(family.invert(makeAnonChange(rootChange1a), false), expectedInverse);
		});

		it("generic", () => {
			const expectedInverse = buildChangeset([
				{
					type: "field",
					field: pathA0A,
					fieldKind: valueField.identifier,
					change: brand(valueInverse1),
				},
				{
					type: "field",
					field: pathB,
					fieldKind: valueField.identifier,
					change: brand(valueInverse2),
				},
			]);

			assert.deepEqual(
				family.invert(makeAnonChange(rootChange1aGeneric), false),
				expectedInverse,
			);
		});

		it("build => destroy but only for rollback", () => {
			const change1: TaggedChange<ModularChangeset> = tagChangeInline(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					builds: new Map([
						[undefined, new Map([[brand(0), node1Chunk]])],
						[tag2, new Map([[brand(1), node1Chunk]])],
					]),
				},
				tag1,
			);

			const expectedRollback: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map([]),
				destroys: new Map([
					[tag1, new Map([[brand(0), 1]])],
					[tag2, new Map([[brand(1), 1]])],
				]),
			};
			const expectedUndo: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map([]),
			};

			deepFreeze(change1);
			const actualRollback = family.invert(change1, true);
			const actualUndo = family.invert(change1, false);
			assert.deepEqual(actualRollback, expectedRollback);
			assert.deepEqual(actualUndo, expectedUndo);
		});
	});

	describe("rebase", () => {
		it("rebase specific ↷ specific", () => {
			const rebased = family.rebase(
				makeAnonChange(rootChange1b),
				makeAnonChange(rootChange1a),
				revisionMetadataSourceFromInfo([]),
			);
			assert.deepEqual(rebased, rebasedChange);
		});

		it("rebase specific ↷ generic", () => {
			const rebased = family.rebase(
				makeAnonChange(rootChange1b),
				makeAnonChange(rootChange1aGeneric),
				revisionMetadataSourceFromInfo([]),
			);
			assert.deepEqual(rebased, rebasedChange);
		});

		it("rebase generic ↷ specific", () => {
			const rebased = family.rebase(
				makeAnonChange(rootChange1bGeneric),
				makeAnonChange(rootChange1a),
				revisionMetadataSourceFromInfo([]),
			);
			assert.deepEqual(rebased, rebasedChange);
		});

		it("rebase generic ↷ generic", () => {
			const rebased = family.rebase(
				makeAnonChange(rootChange1bGeneric),
				makeAnonChange(rootChange1aGeneric),
				revisionMetadataSourceFromInfo([]),
			);
			assert.deepEqual(rebased, rebasedChangeGeneric);
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
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					builds: new Map([
						[undefined, new Map([[brand(1), node1Chunk]])],
						[
							tag2,
							new Map([
								[brand(2), node1Chunk],
								[brand(3), nodesChunk],
							]),
						],
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
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					destroys: new Map([
						[undefined, new Map([[brand(1), 1]])],
						[tag2, new Map([[brand(2), 1]])],
						[tag2, new Map([[brand(3), 10]])],
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
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					refreshers: new Map([
						[undefined, new Map([[brand(1), node1Chunk]])],
						[
							tag2,
							new Map([
								[brand(2), node1Chunk],
								[brand(3), nodesChunk],
							]),
						],
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
				nodeChanges: new Map(),
				fieldChanges: new Map([
					[brand("fA"), { fieldKind, change: brand(changeA) }],
					[brand("fB"), { fieldKind, change: brand(changeB) }],
				]),
			};

			const actual = relevantRemovedRoots(input);
			assert.deepEqual(actual, [a1, a2, b1]);
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
				nodeChanges: nestedMapFromFlatList([
					[nodeId1.revision, nodeId1.localId, nodeChangeFromHasRemovedRootsRefs(changeB)],
					[nodeId2.revision, nodeId2.localId, nodeChangeFromHasRemovedRootsRefs(changeC)],
				]),
				fieldChanges: new Map([[brand("fA"), { fieldKind, change: brand(changeA) }]]),
			};

			const actual = relevantRemovedRoots(input);
			assert.deepEqual(actual, [a1, c1]);
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
				nodeChanges: new Map(),
				fieldChanges: new Map([]),
				refreshers: new Map([[aMajor, new Map([[brand(2), node2Chunk]])]]),
			};

			const expected: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map([]),
				refreshers: new Map([[aMajor, new Map([[brand(2), node2Chunk]])]]),
			};

			const withBuilds = updateRefreshers(input, getDetachedNode, [a2]);
			assert.deepEqual(withBuilds, expected);
		});

		it("removes irrelevant refreshers that are present in the input", () => {
			const input: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map([]),
				refreshers: new Map([
					[
						aMajor,
						new Map([
							[brand(1), node1Chunk],
							[brand(2), node2Chunk],
						]),
					],
					[bMajor, new Map([[brand(1), node3Chunk]])],
				]),
			};

			const expected: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map([]),
			};

			const filtered = updateRefreshers(input, getDetachedNode, []);
			assert.deepEqual(filtered, expected);
		});

		it("recognizes chunks in the builds array with length longer than one", () => {
			assert.equal(nodesChunk.topLevelLength, 2);
			const input: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map([]),
				builds: new Map([[aMajor, new Map([[brand(3), nodesChunk]])]]),
			};

			const expected: ModularChangeset = {
				nodeChanges: new Map(),
				fieldChanges: new Map([]),
				builds: new Map([[aMajor, new Map([[brand(3), nodesChunk]])]]),
			};

			const withBuilds = updateRefreshers(input, getDetachedNode, [
				{ major: aMajor, minor: 4 },
			]);
			assert.deepEqual(withBuilds, expected);
		});

		describe("attempts to add relevant refreshers that are missing from the input", () => {
			it("adds the missing refresher if the detached node is available", () => {
				const input: ModularChangeset = {
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
				};

				const expected: ModularChangeset = {
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					refreshers: new Map([
						[
							aMajor,
							new Map([
								[brand(1), node1Chunk],
								[brand(2), node2Chunk],
							]),
						],
						[bMajor, new Map([[brand(1), node3Chunk]])],
					]),
				};

				const withBuilds = updateRefreshers(input, getDetachedNode, [a1, a2, b1]);
				assert.deepEqual(withBuilds, expected);
			});

			it("replaces outdated refreshers", () => {
				const input: ModularChangeset = {
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					refreshers: new Map([
						[
							aMajor,
							new Map([
								[brand(1), node2Chunk],
								[brand(2), node1Chunk],
							]),
						],
					]),
				};

				const expected: ModularChangeset = {
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					refreshers: new Map([
						[
							aMajor,
							new Map([
								[brand(1), node1Chunk],
								[brand(2), node2Chunk],
							]),
						],
					]),
				};

				const filtered = updateRefreshers(input, getDetachedNode, [a1, a2]);
				assert.deepEqual(filtered, expected);
			});

			it("does not add a refresher that is present in the builds", () => {
				const input: ModularChangeset = {
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					builds: new Map([
						[
							aMajor,
							new Map([
								[brand(1), node1Chunk],
								[brand(2), node2Chunk],
							]),
						],
						[bMajor, new Map([[brand(1), node3Chunk]])],
					]),
				};

				const expected: ModularChangeset = {
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					builds: new Map([
						[
							aMajor,
							new Map([
								[brand(1), node1Chunk],
								[brand(2), node2Chunk],
							]),
						],
						[bMajor, new Map([[brand(1), node3Chunk]])],
					]),
				};

				const withBuilds = updateRefreshers(input, getDetachedNode, [a1, a2, b1]);
				assert.deepEqual(withBuilds, expected);
			});

			it("throws if the detached node is not available and requireRefreshers is true", () => {
				const input: ModularChangeset = {
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
				};
				assert.throws(() => updateRefreshers(input, getDetachedNode, [{ minor: 2 }]));
			});
		});
	});

	describe("Encoding", () => {
		function assertEquivalent(change1: ModularChangeset, change2: ModularChangeset) {
			assert.deepEqual(normalizeChangeset(change1), normalizeChangeset(change2));
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
							builds: new Map([
								[undefined, new Map([[brand(1), node1Chunk]])],
								[tag2, new Map([[brand(2), nodesChunk]])],
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
							refreshers: new Map([
								[undefined, new Map([[brand(1), node1Chunk]])],
								[tag2, new Map([[brand(2), nodesChunk]])],
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
		);
		const changes = getChanges();
		const nodeChange: NodeChangeset = {
			fieldChanges: new Map([
				[fieldB, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
			]),
		};

		const nodeId0: NodeId = { localId: brand(0) };
		const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(0, nodeId0);
		const expectedChange: ModularChangeset = {
			maxId: brand(0),
			nodeChanges: nestedMapFromFlatList([[nodeId0.revision, nodeId0.localId, nodeChange]]),
			fieldChanges: new Map([
				[fieldA, { fieldKind: genericFieldKind.identifier, change: brand(fieldChange) }],
			]),
		};

		assert.deepEqual(changes, [expectedChange]);
	});
});

function treeChunkFromCursor(cursor: ITreeCursorSynchronous): TreeChunk {
	return chunkTree(cursor, defaultChunkPolicy);
}

function deepCloneChunkedTree(chunk: TreeChunk): TreeChunk {
	const jsonable = jsonableTreeFromFieldCursor(chunk.cursor());
	const cursor = cursorForJsonableTreeField(jsonable);
	const clone = chunkFieldSingle(cursor, defaultChunkPolicy);
	return clone;
}

function normalizeChangeset(change: ModularChangeset): ModularChangeset {
	const idAllocator = idAllocatorFromMaxId();

	const nodeChanges: ChangeAtomIdMap<NodeChangeset> = new Map();

	const normalizeNodeChanges = (nodeId: NodeId): NodeId | undefined => {
		const nodeChangeset = tryGetFromNestedMap(
			change.nodeChanges,
			nodeId.revision,
			nodeId.localId,
		);
		assert(nodeChangeset !== undefined, "Unknown node ID");

		const normalizedNodeChangeset: NodeChangeset = { ...nodeChangeset };
		if (normalizedNodeChangeset.fieldChanges !== undefined) {
			normalizedNodeChangeset.fieldChanges = normalizeFieldChanges(
				normalizedNodeChangeset.fieldChanges,
			);
		}

		const newId: NodeId = { localId: brand(idAllocator.allocate()) };
		setInNestedMap(nodeChanges, newId.revision, newId.localId, normalizedNodeChangeset);

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
		}

		return normalizedFieldChanges;
	}

	const fieldChanges = normalizeFieldChanges(change.fieldChanges);
	assert(nodeChanges.size === change.nodeChanges.size);

	const normal: Mutable<ModularChangeset> = { ...change, nodeChanges, fieldChanges };

	// The TreeChunk objects need to be deep cloned to avoid comparison issues on reference counting
	if (change.builds !== undefined) {
		normal.builds = mapNestedMap(change.builds, deepCloneChunkedTree);
	}
	if (change.refreshers !== undefined) {
		normal.refreshers = mapNestedMap(change.refreshers, deepCloneChunkedTree);
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

function buildChangeset(edits: EditDescription[]): ModularChangeset {
	const editor = family.buildEditor(() => undefined);
	return editor.buildChanges(edits);
}

function buildExistsConstraint(path: UpPath): ModularChangeset {
	const edits: ModularChangeset[] = [];
	const editor = family.buildEditor((change) => edits.push(change));
	editor.addNodeExistsConstraint(path);
	return edits[0];
}
