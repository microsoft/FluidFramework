/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SessionId } from "@fluidframework/id-compressor";

import { ICodecOptions, IJsonCodec, makeCodecFamily } from "../../../codec/index.js";
import {
	FieldChangeHandler,
	genericFieldKind,
	FieldChange,
	ModularChangeset,
	FieldKindWithEditor,
	RelevantRemovedRootsFromChild,
	chunkTree,
	defaultChunkPolicy,
	TreeChunk,
	cursorForJsonableTreeField,
	chunkFieldSingle,
	makeFieldBatchCodec,
	NodeId,
	FieldKindConfiguration,
	FieldKindConfigurationEntry,
	makeModularChangeCodecFamily,
	ModularChangeFamily,
	EncodedModularChangeset,
	FieldChangeRebaser,
	FieldEditor,
} from "../../../feature-libraries/index.js";
import {
	makeAnonChange,
	makeDetachedNodeId,
	RevisionTag,
	tagChange,
	TaggedChange,
	FieldKindIdentifier,
	FieldKey,
	UpPath,
	revisionMetadataSourceFromInfo,
	ITreeCursorSynchronous,
	DeltaFieldChanges,
	DeltaRoot,
	DeltaDetachedNodeId,
	ChangeEncodingContext,
	ChangeAtomIdMap,
	taggedAtomId,
	Multiplicity,
} from "../../../core/index.js";
import {
	brand,
	idAllocatorFromMaxId,
	nestedMapFromFlatList,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../../util/index.js";
import {
	EncodingTestData,
	assertDeltaEqual,
	deepFreeze,
	makeEncodingTestSuite,
	mintRevisionTag,
	testChangeReceiver,
	testRevisionTagCodec,
} from "../../utils.js";

import { ValueChangeset, valueField } from "./basicRebasers.js";
import { ajvValidator } from "../../codec/index.js";
import { jsonObject, singleJsonCursor } from "../../../domains/index.js";
import {
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
import {
	EncodedNodeChangeset,
	FieldChangeEncodingContext,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";

type SingleNodeChangeset = NodeId | undefined;
const singleNodeRebaser: FieldChangeRebaser<SingleNodeChangeset> = {
	compose: (change1, change2, composeChild) => composeChild(change1.change, change2.change),
	invert: (change) => change.change,
	rebase: (change, base, rebaseChild) => rebaseChild(change, base.change),
	prune: (change, pruneChild) => (change === undefined ? undefined : pruneChild(change)),
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
	codecsFactory: (revisionTagCodec) => makeCodecFamily([[0, singleNodeCodec]]),
	editor: singleNodeEditor,
	intoDelta: ({ change }, deltaFromChild): DeltaFieldChanges => ({
		local: [{ count: 1, fields: change !== undefined ? deltaFromChild(change) : undefined }],
	}),
	relevantRemovedRoots: (change, relevantRemovedRootsFromChild) =>
		change.change !== undefined ? relevantRemovedRootsFromChild(change.change) : [],
	isEmpty: (change) => change === undefined,
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
	[singleNodeField.identifier, { kind: singleNodeField, formatVersion: 0 }],
	[valueField.identifier, { kind: valueField, formatVersion: 0 }],
]);

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor> = new Map(
	[singleNodeField, valueField].map((field) => [field.identifier, field]),
);

const codecOptions: ICodecOptions = {
	jsonValidator: ajvValidator,
};

const codec = makeModularChangeCodecFamily(
	new Map([[0, fieldKindConfiguration]]),
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
const nodeChange1a: NodeChangeset = {
	fieldChanges: new Map([
		[fieldA, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
	]),
};

const nodeChanges1b: NodeChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: valueField.identifier,
				change: brand(valueChange1b),
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

const nodeId2: NodeId = { localId: brand(2) };
const nodeChanges2: NodeChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: valueField.identifier,
				change: brand(valueChange2),
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

const nodeId3: NodeId = { localId: brand(3) };
const nodeChange3: NodeChangeset = {
	fieldChanges: new Map([
		[fieldA, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
	]),
};

const nodeId4: NodeId = { localId: brand(4) };
const nodeChange4: NodeChangeset = {
	fieldChanges: new Map([
		[fieldA, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
	]),
	nodeExistsConstraint: {
		violated: false,
	},
};

const nodeChangeWithoutFieldChanges: NodeChangeset = {
	nodeExistsConstraint: {
		violated: false,
	},
};

const rootChange1a: ModularChangeset = {
	nodeChanges: nestedMapFromFlatList([[nodeId1.revision, nodeId1.localId, nodeChange1a]]),
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeId1),
			},
		],
		[
			fieldB,
			{
				fieldKind: valueField.identifier,
				change: brand(valueChange2),
			},
		],
	]),
};

const rootChange1aGeneric: ModularChangeset = {
	nodeChanges: new Map([[nodeId1.revision, new Map([[nodeId1.localId, nodeChange1a]])]]),
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(genericFieldKind.changeHandler.editor.buildChildChange(0, nodeId1)),
			},
		],
		[
			fieldB,
			{
				fieldKind: valueField.identifier,
				change: brand(valueChange2),
			},
		],
	]),
};

const rootChange1b: ModularChangeset = {
	nodeChanges: nestedMapFromFlatList([[nodeId1.revision, nodeId1.localId, nodeChanges1b]]),
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeId1),
			},
		],
	]),
};

const rootChange1bGeneric: ModularChangeset = {
	nodeChanges: new Map([[nodeId1.revision, new Map([[nodeId1.localId, nodeChanges1b]])]]),
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(genericFieldKind.changeHandler.editor.buildChildChange(0, nodeId1)),
			},
		],
	]),
};

const rebasedChange: ModularChangeset = {
	nodeChanges: nestedMapFromFlatList([[nodeId1.revision, nodeId1.localId, nodeChanges2]]),
	fieldChanges: new Map([
		[fieldA, { fieldKind: singleNodeField.identifier, change: brand(nodeId1) }],
	]),
};

const rebasedChangeGeneric: ModularChangeset = {
	nodeChanges: nestedMapFromFlatList([[nodeId1.revision, nodeId1.localId, nodeChanges2]]),
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(genericFieldKind.changeHandler.editor.buildChildChange(0, nodeId1)),
			},
		],
	]),
};

const rootChange2: ModularChangeset = {
	nodeChanges: nestedMapFromFlatList([[nodeId2.revision, nodeId2.localId, nodeChanges2]]),
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeId2),
			},
		],
	]),
};

const rootChange2Generic: ModularChangeset = {
	nodeChanges: nestedMapFromFlatList([[nodeId2.revision, nodeId2.localId, nodeChanges2]]),
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(genericFieldKind.changeHandler.editor.buildChildChange(0, nodeId2)),
			},
		],
	]),
};

const rootChange3: ModularChangeset = {
	nodeChanges: nestedMapFromFlatList([[nodeId3.revision, nodeId3.localId, nodeChange3]]),
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeId3),
			},
		],
	]),
};

const dummyMaxId = 10;
const dummyRevisionTag = mintRevisionTag();
const rootChange4: ModularChangeset = {
	maxId: brand(dummyMaxId),
	revisions: [{ revision: dummyRevisionTag }],
	nodeChanges: nestedMapFromFlatList([[nodeId4.revision, nodeId4.localId, nodeChange4]]),
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeId4),
			},
		],
	]),
};

const rootChangeWithoutNodeFieldChanges: ModularChangeset = {
	maxId: brand(dummyMaxId),
	revisions: [{ revision: dummyRevisionTag }],
	nodeChanges: nestedMapFromFlatList([
		[nodeId4.revision, nodeId4.localId, nodeChangeWithoutFieldChanges],
	]),
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeId4),
			},
		],
	]),
};

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
			const expectedCompose: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[nodeId1.revision, nodeId1.localId, composedNodeChange],
				]),
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(nodeId1),
						},
					],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};

			const composed = family.compose([
				makeAnonChange(rootChange1a),
				makeAnonChange(rootChange2),
			]);

			assert.deepEqual(composed, expectedCompose);
		});

		it("compose specific ○ generic", () => {
			const expectedCompose: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[nodeId1.revision, nodeId1.localId, composedNodeChange],
				]),
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(nodeId1),
						},
					],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};
			assert.deepEqual(
				family.compose([makeAnonChange(rootChange1a), makeAnonChange(rootChange2Generic)]),
				expectedCompose,
			);
		});

		it("compose generic ○ specific", () => {
			const expectedCompose: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[nodeId1.revision, nodeId1.localId, composedNodeChange],
				]),
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(nodeId1),
						},
					],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};
			assert.deepEqual(
				family.compose([makeAnonChange(rootChange1aGeneric), makeAnonChange(rootChange2)]),
				expectedCompose,
			);
		});

		it("compose generic ○ generic", () => {
			const expectedCompose: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[nodeId1.revision, nodeId1.localId, composedNodeChange],
				]),
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: genericFieldKind.identifier,
							change: brand(
								genericFieldKind.changeHandler.editor.buildChildChange(0, nodeId1),
							),
						},
					],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							change: brand(valueChange2),
						},
					],
				]),
			};
			assert.deepEqual(
				family.compose([
					makeAnonChange(rootChange1aGeneric),
					makeAnonChange(rootChange2Generic),
				]),
				expectedCompose,
			);
		});

		it("compose tagged changes", () => {
			const change1A: FieldChange = {
				fieldKind: valueField.identifier,
				change: brand(valueChange1a),
			};

			const change1: TaggedChange<ModularChangeset> = tagChange(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([[fieldA, change1A]]),
				},
				tag1,
			);

			const nodeChange2: NodeChangeset = {
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

			const change2B: FieldChange = {
				fieldKind: singleNodeField.identifier,
				change: brand(nodeId2),
			};

			deepFreeze(change2B);
			const change2: TaggedChange<ModularChangeset> = tagChange(
				{
					nodeChanges: nestedMapFromFlatList([
						[nodeId2.revision, nodeId2.localId, nodeChange2],
					]),
					fieldChanges: new Map([[fieldB, change2B]]),
				},
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

			const taggedNodeId2: NodeId = taggedAtomId(nodeId2, tag2);
			const expected: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[taggedNodeId2.revision, taggedNodeId2.localId, expectedNodeChange],
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
							change: brand(taggedNodeId2),
						},
					],
				]),
				revisions: [{ revision: tag1 }, { revision: tag2 }],
			};

			assert.deepEqual(composed, expected);
		});

		it("build ○ matching destroy = ε", () => {
			const change1: TaggedChange<ModularChangeset> = tagChange(
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

			const change2: TaggedChange<ModularChangeset> = tagChange(
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
			const change1: TaggedChange<ModularChangeset> = tagChange(
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

			const change2: TaggedChange<ModularChangeset> = tagChange(
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
			const change1: TaggedChange<ModularChangeset> = tagChange(
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
			const change1: TaggedChange<ModularChangeset> = tagChange(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					refreshers: new Map([
						[tag3, new Map([[brand(0), treeChunkFromCursor(node1)]])],
					]),
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
			const change1: TaggedChange<ModularChangeset> = tagChange(
				{
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					refreshers: new Map([
						[tag3, new Map([[brand(0), treeChunkFromCursor(node1)]])],
					]),
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

		const nodeInverse: NodeChangeset = {
			fieldChanges: new Map([
				[
					fieldA,
					{
						fieldKind: valueField.identifier,
						change: brand(valueInverse1),
					},
				],
			]),
		};

		it("specific", () => {
			const expectedInverse: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[nodeId1.revision, nodeId1.localId, nodeInverse],
				]),
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(nodeId1),
						},
					],
					[fieldB, { fieldKind: valueField.identifier, change: brand(valueInverse2) }],
				]),
			};

			assert.deepEqual(family.invert(makeAnonChange(rootChange1a), false), expectedInverse);
		});

		it("generic", () => {
			const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(0, nodeId1);
			const expectedInverse: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[nodeId1.revision, nodeId1.localId, nodeInverse],
				]),
				fieldChanges: new Map([
					[
						fieldA,
						{ fieldKind: genericFieldKind.identifier, change: brand(fieldChange) },
					],
					[fieldB, { fieldKind: valueField.identifier, change: brand(valueInverse2) }],
				]),
			};

			assert.deepEqual(
				family.invert(makeAnonChange(rootChange1aGeneric), false),
				expectedInverse,
			);
		});

		it("build => destroy but only for rollback", () => {
			const change1: TaggedChange<ModularChangeset> = tagChange(
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
				rootChange1b,
				makeAnonChange(rootChange1a),
				revisionMetadataSourceFromInfo([]),
			);
			assert.deepEqual(rebased, rebasedChange);
		});

		it("rebase specific ↷ generic", () => {
			const rebased = family.rebase(
				rootChange1b,
				makeAnonChange(rootChange1aGeneric),
				revisionMetadataSourceFromInfo([]),
			);
			assert.deepEqual(rebased, rebasedChange);
		});

		it("rebase generic ↷ specific", () => {
			const rebased = family.rebase(
				rootChange1bGeneric,
				makeAnonChange(rootChange1a),
				revisionMetadataSourceFromInfo([]),
			);
			assert.deepEqual(rebased, rebasedChange);
		});

		it("rebase generic ↷ generic", () => {
			const rebased = family.rebase(
				rootChange1bGeneric,
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
									local: [
										{ count: 1, detach: { minor: 0 }, attach: { minor: 1 } },
									],
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
			const change1: TaggedChange<ModularChangeset> = tagChange(
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
			const change1: TaggedChange<ModularChangeset> = tagChange(
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
			const change1: TaggedChange<ModularChangeset> = tagChange(
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

		const handler: FieldChangeHandler<HasRemovedRootsRefs, any> = {
			relevantRemovedRoots: (
				{ change, revision }: TaggedChange<HasRemovedRootsRefs>,
				relevantRemovedRootsFromChild: RelevantRemovedRootsFromChild,
			) => {
				return [
					...change.shallow.map((id) =>
						makeDetachedNodeId(id.major ?? revision, id.minor),
					),
					...change.nested.flatMap((c) => Array.from(relevantRemovedRootsFromChild(c))),
				];
			},
		} as unknown as FieldChangeHandler<HasRemovedRootsRefs, any>;
		const hasRemovedRootsRefsField = new FieldKindWithEditor(
			fieldKind,
			Multiplicity.Single,
			handler,
			() => false,
			new Set(),
		);
		const mockFieldKinds = new Map([[fieldKind, hasRemovedRootsRefsField]]);

		function relevantRemovedRoots(
			input: TaggedChange<ModularChangeset>,
		): DeltaDetachedNodeId[] {
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

			const actual = relevantRemovedRoots(makeAnonChange(input));
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

			const actual = relevantRemovedRoots(makeAnonChange(input));
			assert.deepEqual(actual, [a1, c1]);
		});

		it("default revision from tag", () => {
			const major = mintRevisionTag();
			const changeB: HasRemovedRootsRefs = {
				shallow: [{ minor: 2 }],
				nested: [],
			};
			const changeA: HasRemovedRootsRefs = {
				shallow: [{ minor: 1 }],
				nested: [nodeId1],
			};
			const input: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[nodeId1.revision, nodeId1.localId, nodeChangeFromHasRemovedRootsRefs(changeB)],
				]),
				fieldChanges: new Map([[brand("fA"), { fieldKind, change: brand(changeA) }]]),
			};

			const actual = relevantRemovedRoots(tagChange(input, major));
			assert.deepEqual(actual, [
				{ major, minor: 1 },
				{ major, minor: 2 },
			]);
		});

		it("default revision from field", () => {
			const majorAB = mintRevisionTag();
			const majorC = mintRevisionTag();
			const changeB: HasRemovedRootsRefs = {
				shallow: [{ minor: 2 }],
				nested: [],
			};
			const changeA: HasRemovedRootsRefs = {
				shallow: [{ minor: 1 }],
				nested: [nodeId1],
			};
			const changeC: HasRemovedRootsRefs = {
				shallow: [{ minor: 1 }],
				nested: [],
			};
			const input: ModularChangeset = {
				nodeChanges: nestedMapFromFlatList([
					[nodeId1.revision, nodeId1.localId, nodeChangeFromHasRemovedRootsRefs(changeB)],
				]),
				fieldChanges: new Map([
					[
						brand("fA"),
						{
							fieldKind,
							change: brand(changeA),
							revision: majorAB,
						},
					],
					[
						brand("fC"),
						{
							fieldKind,
							change: brand(changeC),
							revision: majorC,
						},
					],
				]),
			};

			const actual = relevantRemovedRoots(makeAnonChange(input));
			assert.deepEqual(actual, [
				{ major: majorAB, minor: 1 },
				{ major: majorAB, minor: 2 },
				{ major: majorC, minor: 1 },
			]);
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

			const withBuilds = updateRefreshers(makeAnonChange(input), getDetachedNode, [a2]);
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

			const filtered = updateRefreshers(makeAnonChange(input), getDetachedNode, []);
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

			const withBuilds = updateRefreshers(makeAnonChange(input), getDetachedNode, [
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

				const withBuilds = updateRefreshers(makeAnonChange(input), getDetachedNode, [
					a1,
					a2,
					b1,
				]);
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

				const filtered = updateRefreshers(makeAnonChange(input), getDetachedNode, [a1, a2]);
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

				const withBuilds = updateRefreshers(makeAnonChange(input), getDetachedNode, [
					a1,
					a2,
					b1,
				]);
				assert.deepEqual(withBuilds, expected);
			});

			it("throws if the detached node is not available", () => {
				const input: ModularChangeset = {
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
				};

				assert.throws(() =>
					updateRefreshers(makeAnonChange(input), getDetachedNode, [{ minor: 2 }]),
				);
			});
		});

		describe("handles implicit and explicit build revision representations", () => {
			it("explicit builds", () => {
				const explicitBuild: ModularChangeset = {
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					builds: new Map([[tag1, new Map([[brand(1), node1Chunk]])]]),
				};
				const withBuilds = updateRefreshers(
					makeAnonChange(explicitBuild),
					getDetachedNode,
					[{ major: tag1, minor: 1 }],
				);
				assert.deepEqual(withBuilds, explicitBuild);
			});
			it("implicit builds", () => {
				const implicitBuild: ModularChangeset = {
					nodeChanges: new Map(),
					fieldChanges: new Map([]),
					builds: new Map([[undefined, new Map([[brand(1), node1Chunk]])]]),
				};
				const withBuilds = updateRefreshers(
					tagChange(implicitBuild, tag1),
					getDetachedNode,
					[{ major: tag1, minor: 1 }],
				);
				assert.deepEqual(withBuilds, implicitBuild);
			});
		});
	});

	describe("Encoding", () => {
		function assertEquivalent(change1: ModularChangeset, change2: ModularChangeset) {
			assert.deepEqual(normalizeChangeset(change1), normalizeChangeset(change2));
		}

		const sessionId = "session1" as SessionId;
		const context: ChangeEncodingContext = { originatorId: sessionId };
		const encodingTestData: EncodingTestData<
			ModularChangeset,
			EncodedModularChangeset,
			ChangeEncodingContext
		> = {
			successes: [
				["without constraint", rootChange1a, context],
				["with constraint", rootChange3, context],
				["with node existence constraint", rootChange4, context],
				["without node field changes", rootChangeWithoutNodeFieldChanges, context],
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
	return { ...change, nodeChanges, fieldChanges };
}
