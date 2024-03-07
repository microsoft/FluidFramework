/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SessionId } from "@fluidframework/id-compressor";
import {
	FieldChangeHandler,
	FieldChangeRebaser,
	Multiplicity,
	FieldEditor,
	NodeChangeset,
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
} from "../../../core/index.js";
import { brand, nestedMapFromFlatList, tryGetFromNestedMap } from "../../../util/index.js";
import { ICodecOptions, makeCodecFamily } from "../../../codec/index.js";
import {
	EncodingTestData,
	assertDeltaEqual,
	deepFreeze,
	makeEncodingTestSuite,
	mintRevisionTag,
	testChangeReceiver,
	testRevisionTagCodec,
} from "../../utils.js";
import {
	ModularChangeFamily,
	relevantRemovedRoots as relevantDetachedTreesImplementation,
	intoDelta,
	updateRefreshers,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import { jsonObject, singleJsonCursor } from "../../../domains/index.js";
// Allows typechecking test data used in modulaChangeFamily's codecs.
// eslint-disable-next-line import/no-internal-modules
import { EncodedModularChangeset } from "../../../feature-libraries/modular-schema/modularChangeFormat.js";
import { ajvValidator } from "../../codec/index.js";
import { ValueChangeset, valueField } from "./basicRebasers.js";

const singleNodeRebaser: FieldChangeRebaser<NodeChangeset> = {
	compose: (change1, change2, composeChild) => composeChild(change1.change, change2.change),
	invert: (change, invertChild) => invertChild(change.change),
	rebase: (change, base, rebaseChild) => rebaseChild(change, base.change) ?? {},
	prune: (change) => change,
};

const singleNodeEditor: FieldEditor<NodeChangeset> = {
	buildChildChange: (index: number, change: NodeChangeset): NodeChangeset => {
		assert(index === 0, "This field kind only supports one node in its field");
		return change;
	},
};

const singleNodeHandler: FieldChangeHandler<NodeChangeset> = {
	rebaser: singleNodeRebaser,
	codecsFactory: (childCodec) => makeCodecFamily([[0, childCodec]]),
	editor: singleNodeEditor,
	intoDelta: ({ change }, deltaFromChild): DeltaFieldChanges => ({
		local: [{ count: 1, fields: deltaFromChild(change) }],
	}),
	relevantRemovedRoots: (change, relevantRemovedRootsFromChild) =>
		relevantRemovedRootsFromChild(change.change),
	isEmpty: (change) => change.fieldChanges === undefined,
	createEmpty: () => ({}),
};

const singleNodeField = new FieldKindWithEditor(
	"SingleNode",
	Multiplicity.Single,
	singleNodeHandler,
	(a, b) => false,
	new Set(),
);

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor> = new Map(
	[singleNodeField, valueField].map((field) => [field.identifier, field]),
);

const codecOptions: ICodecOptions = {
	jsonValidator: ajvValidator,
};
const family = new ModularChangeFamily(
	fieldKinds,
	testRevisionTagCodec,
	makeFieldBatchCodec(codecOptions),
	codecOptions,
);

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();

const fieldA: FieldKey = brand("a");
const fieldB: FieldKey = brand("b");

const valueChange1a: ValueChangeset = { old: 0, new: 1 };
const valueChange1b: ValueChangeset = { old: 0, new: 2 };
const valueChange2: ValueChangeset = { old: 1, new: 2 };

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

const nodeChange3: NodeChangeset = {
	fieldChanges: new Map([
		[fieldA, { fieldKind: valueField.identifier, change: brand(valueChange1a) }],
	]),
};

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
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChange1a),
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
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(
					genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChange1a),
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

const rootChange1b: ModularChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChanges1b),
			},
		],
	]),
};

const rootChange1bGeneric: ModularChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(
					genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChanges1b),
				),
			},
		],
	]),
};

const rootChange2: ModularChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChanges2),
			},
		],
	]),
};

const rootChange2Generic: ModularChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: genericFieldKind.identifier,
				change: brand(
					genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChanges2),
				),
			},
		],
	]),
};

const rootChange3: ModularChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChange3),
			},
		],
	]),
};

const dummyMaxId = 10;
const dummyRevisionTag = mintRevisionTag();
const rootChange4: ModularChangeset = {
	maxId: brand(dummyMaxId),
	revisions: [{ revision: dummyRevisionTag }],
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChange4),
			},
		],
	]),
};

const rootChangeWithoutNodeFieldChanges: ModularChangeset = {
	maxId: brand(dummyMaxId),
	revisions: [{ revision: dummyRevisionTag }],
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: singleNodeField.identifier,
				change: brand(nodeChangeWithoutFieldChanges),
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
				fieldChanges: new Map(),
				builds: new Map([[undefined, new Map([[brand(0), node1Chunk]])]]),
			};
			const change2: ModularChangeset = {
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
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(composedNodeChange),
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
				family.compose([makeAnonChange(rootChange1a), makeAnonChange(rootChange2)]),
				expectedCompose,
			);
		});

		it("compose specific ○ generic", () => {
			const expectedCompose: ModularChangeset = {
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(composedNodeChange),
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
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: singleNodeField.identifier,
							change: brand(composedNodeChange),
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
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: genericFieldKind.identifier,
							change: brand(
								genericFieldKind.changeHandler.editor.buildChildChange(
									0,
									composedNodeChange,
								),
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
				change: brand(nodeChange2),
			};

			deepFreeze(change2B);
			const change2: TaggedChange<ModularChangeset> = tagChange(
				{
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

			const expected: ModularChangeset = {
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
							change: brand(expectedNodeChange),
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
				fieldChanges: new Map(),
				revisions: [{ revision: tag1 }, { revision: tag2 }],
			};

			assert.deepEqual(composed, expected);
		});

		it("destroy ○ matching build = ε", () => {
			const change1: TaggedChange<ModularChangeset> = tagChange(
				{
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
				fieldChanges: new Map(),
				revisions: [{ revision: tag2 }, { revision: tag1 }],
			};

			assert.deepEqual(composed, expected);
		});

		it("non-matching builds and destroys", () => {
			const change1: TaggedChange<ModularChangeset> = tagChange(
				{
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
					fieldChanges: new Map([]),
					refreshers: new Map([
						[tag3, new Map([[brand(0), treeChunkFromCursor(node1)]])],
					]),
				},
				tag1,
			);

			const change2: TaggedChange<ModularChangeset> = tagChange(
				{
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
					fieldChanges: new Map([]),
					refreshers: new Map([
						[tag3, new Map([[brand(0), treeChunkFromCursor(node1)]])],
					]),
				},
				tag1,
			);

			const change2: TaggedChange<ModularChangeset> = tagChange(
				{
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
				fieldChanges: new Map([
					[fieldA, { fieldKind: singleNodeField.identifier, change: brand(nodeInverse) }],
					[fieldB, { fieldKind: valueField.identifier, change: brand(valueInverse2) }],
				]),
			};

			assert.deepEqual(family.invert(makeAnonChange(rootChange1a), false), expectedInverse);
		});

		it("generic", () => {
			const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(
				0,
				nodeInverse,
			);
			const expectedInverse: ModularChangeset = {
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
					fieldChanges: new Map([]),
					builds: new Map([
						[undefined, new Map([[brand(0), node1Chunk]])],
						[tag2, new Map([[brand(1), node1Chunk]])],
					]),
				},
				tag1,
			);

			const expectedRollback: ModularChangeset = {
				fieldChanges: new Map([]),
				destroys: new Map([
					[tag1, new Map([[brand(0), 1]])],
					[tag2, new Map([[brand(1), 1]])],
				]),
			};
			const expectedUndo: ModularChangeset = {
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
			assert.deepEqual(rebased, rootChange2);
		});

		it("rebase specific ↷ generic", () => {
			const rebased = family.rebase(
				rootChange1b,
				makeAnonChange(rootChange1aGeneric),
				revisionMetadataSourceFromInfo([]),
			);
			assert.deepEqual(rebased, rootChange2);
		});

		it("rebase generic ↷ specific", () => {
			const rebased = family.rebase(
				rootChange1bGeneric,
				makeAnonChange(rootChange1a),
				revisionMetadataSourceFromInfo([]),
			);
			assert.deepEqual(rebased, rootChange2);
		});

		it("rebase generic ↷ generic", () => {
			const rebased = family.rebase(
				rootChange1bGeneric,
				makeAnonChange(rootChange1aGeneric),
				revisionMetadataSourceFromInfo([]),
			);
			assert.deepEqual(rebased, rootChange2Generic);
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
			nested: HasRemovedRootsRefs[];
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
					...change.nested.flatMap((c) =>
						Array.from(
							relevantRemovedRootsFromChild({
								fieldChanges: new Map([
									[brand("nested"), { fieldKind, change: brand(c) }],
								]),
							}),
						),
					),
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
				nested: [changeC],
			};
			const changeA: HasRemovedRootsRefs = {
				shallow: [a1],
				nested: [changeB],
			};
			const input: ModularChangeset = {
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
				nested: [changeB],
			};
			const input: ModularChangeset = {
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
				nested: [changeB],
			};
			const changeC: HasRemovedRootsRefs = {
				shallow: [{ minor: 1 }],
				nested: [],
			};
			const input: ModularChangeset = {
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
				fieldChanges: new Map([]),
				refreshers: new Map([[aMajor, new Map([[brand(2), node2Chunk]])]]),
			};

			const expected: ModularChangeset = {
				fieldChanges: new Map([]),
				refreshers: new Map([[aMajor, new Map([[brand(2), node2Chunk]])]]),
			};

			const withBuilds = updateRefreshers(makeAnonChange(input), getDetachedNode, [a2]);
			assert.deepEqual(withBuilds, expected);
		});

		it("removes irrelevant refreshers that are present in the input", () => {
			const input: ModularChangeset = {
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
				fieldChanges: new Map([]),
			};

			const filtered = updateRefreshers(makeAnonChange(input), getDetachedNode, []);
			assert.deepEqual(filtered, expected);
		});

		describe("attempts to add relevant refreshers that are missing from the input", () => {
			it("adds the missing refresher if the detached node is available", () => {
				const input: ModularChangeset = {
					fieldChanges: new Map([]),
				};

				const expected: ModularChangeset = {
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
					fieldChanges: new Map([]),
				};

				assert.throws(() =>
					updateRefreshers(makeAnonChange(input), getDetachedNode, [{ minor: 2 }]),
				);
			});
		});
	});

	describe("Encoding", () => {
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

		makeEncodingTestSuite(family.codecs, encodingTestData);
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

		const fieldChange = genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChange);
		const expectedChange: ModularChangeset = {
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
