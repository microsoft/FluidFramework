/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ICodecOptions } from "../../codec/index.js";
import {
	DeltaDetachedNodeId,
	TaggedChange,
	TreeStoredSchema,
	makeAnonChange,
	revisionMetadataSourceFromInfo,
	rootFieldKey,
} from "../../core/index.js";
import { leaf } from "../../domains/index.js";
// eslint-disable-next-line import/no-internal-modules
import { forbidden } from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import {
	DefaultEditBuilder,
	ModularChangeFamily,
	ModularChangeset,
	TreeChunk,
	cursorForJsonableTreeNode,
	fieldKinds,
} from "../../feature-libraries/index.js";
import {
	SharedTreeChangeFamily,
	updateRefreshers,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/sharedTreeChangeFamily.js";
import {
	SharedTreeChange,
	SharedTreeInnerChange,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/sharedTreeChangeTypes.js";
import { ajvValidator } from "../codec/index.js";
import { deepFreeze, testRevisionTagCodec } from "../utils.js";

const dataChanges: ModularChangeset[] = [];
const codecOptions: ICodecOptions = { jsonValidator: ajvValidator };
const fieldBatchCodec = {
	encode: () => assert.fail("Unexpected encode"),
	decode: () => assert.fail("Unexpected decode"),
};

const modularFamily = new ModularChangeFamily(
	fieldKinds,
	testRevisionTagCodec,
	fieldBatchCodec,
	codecOptions,
);
const defaultEditor = new DefaultEditBuilder(modularFamily, (change) => dataChanges.push(change));

const nodeX = { type: leaf.string.name, value: "X" };
const nodeY = { type: leaf.string.name, value: "Y" };

// Side effects results in `dataChanges` being populated
defaultEditor
	.valueField({ parent: undefined, field: rootFieldKey })
	.set(cursorForJsonableTreeNode(nodeX));
defaultEditor
	.valueField({ parent: undefined, field: rootFieldKey })
	.set(cursorForJsonableTreeNode(nodeY));

const dataChange1 = dataChanges[0];
const dataChange2 = dataChanges[1];
const stDataChange1: SharedTreeChange = {
	changes: [{ type: "data", innerChange: dataChange1 }],
};
const stDataChange2: SharedTreeChange = {
	changes: [{ type: "data", innerChange: dataChange2 }],
};
const emptySchema: TreeStoredSchema = {
	nodeSchema: new Map(),
	rootFieldSchema: {
		kind: forbidden,
	},
};
const stSchemaChange: SharedTreeChange = {
	changes: [{ type: "schema", innerChange: { schema: { new: emptySchema, old: emptySchema } } }],
};
const stEmptyChange: SharedTreeChange = {
	changes: [],
};

const sharedTreeFamily = new SharedTreeChangeFamily(
	testRevisionTagCodec,
	fieldBatchCodec,
	codecOptions,
);

describe("SharedTreeChangeFamily", () => {
	it("composition composes runs of data changes", () => {
		assert.deepEqual(
			sharedTreeFamily.compose([
				makeAnonChange(stDataChange1),
				makeAnonChange(stDataChange2),
				makeAnonChange(stSchemaChange),
				makeAnonChange(stDataChange1),
				makeAnonChange(stDataChange2),
				makeAnonChange(stDataChange2),
			]),
			{
				changes: [
					{
						type: "data",
						innerChange: modularFamily.compose([
							makeAnonChange(dataChange1),
							makeAnonChange(dataChange2),
						]),
					},
					stSchemaChange.changes[0],
					{
						type: "data",
						innerChange: modularFamily.compose([
							makeAnonChange(dataChange1),
							makeAnonChange(dataChange2),
							makeAnonChange(dataChange2),
						]),
					},
				],
			},
		);
	});

	it("empty changes result in no-op rebases", () => {
		assert.deepEqual(
			sharedTreeFamily.rebase(
				stSchemaChange,
				makeAnonChange(stEmptyChange),
				revisionMetadataSourceFromInfo([]),
			),
			stSchemaChange,
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				stDataChange1,
				makeAnonChange(stEmptyChange),
				revisionMetadataSourceFromInfo([]),
			),
			stDataChange1,
		);
	});

	it("schema edits cause all concurrent changes to conflict", () => {
		assert.deepEqual(
			sharedTreeFamily.rebase(
				stSchemaChange,
				makeAnonChange(stDataChange1),
				revisionMetadataSourceFromInfo([]),
			),
			{
				changes: [],
			},
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				stDataChange1,
				makeAnonChange(stSchemaChange),
				revisionMetadataSourceFromInfo([]),
			),
			{
				changes: [],
			},
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				stSchemaChange,
				makeAnonChange(stSchemaChange),
				revisionMetadataSourceFromInfo([]),
			),
			{
				changes: [],
			},
		);
	});

	describe("without schema edits should behave identically to ModularChangeFamily", () => {
		it("when composing", () => {
			assert.deepEqual(
				sharedTreeFamily.compose([
					makeAnonChange(stDataChange1),
					makeAnonChange(stDataChange2),
				]),
				{
					changes: [
						{
							type: "data",
							innerChange: modularFamily.compose([
								makeAnonChange(dataChange1),
								makeAnonChange(dataChange2),
							]),
						},
					],
				},
			);
		});

		it("when rebasing", () => {
			assert.deepEqual(
				sharedTreeFamily.rebase(
					stDataChange1,
					makeAnonChange(stDataChange2),
					revisionMetadataSourceFromInfo([]),
				),
				{
					changes: [
						{
							type: "data",
							innerChange: modularFamily.rebase(
								dataChange1,
								makeAnonChange(dataChange2),
								revisionMetadataSourceFromInfo([]),
							),
						},
					],
				},
			);
		});

		for (const isRollback of [true, false]) {
			it(`when inverting (isRollback = ${isRollback})`, () => {
				assert.deepEqual(
					sharedTreeFamily.invert(makeAnonChange(stDataChange1), isRollback),
					{
						changes: [
							{
								type: "data",
								innerChange: modularFamily.invert(
									makeAnonChange(dataChange1),
									isRollback,
								),
							},
						],
					},
				);
			});
		}
	});

	describe("updateRefreshers", () => {
		// The tests below heavily mock the inputs to updateRefreshers.
		// This is done to simplify the tests, but it also has the effect of reducing their dependency on the
		// ModularChangeset format and on the behavior of the helper functions that operate on it.
		// ModularChangeset instances that are used as input are mocked to represent the list of relevant node IDs that
		// they need refreshers for.
		// ModularChangeset instances that are used as output are mocked to represent the list refreshers that are
		// included in them. The refreshers themselves are mocked using unique strings.
		const idInForest1: DeltaDetachedNodeId = { minor: 1 };
		const idInForest2: DeltaDetachedNodeId = { minor: 2 };
		const idNotInForest: DeltaDetachedNodeId = { minor: 3 };
		const refresher1: TreeChunk = "refresher1" as any;
		const refresher2: TreeChunk = "refresher2" as any;
		const schemaChange: SharedTreeInnerChange = {
			type: "schema",
			innerChange: "MockSchemaChange" as any,
		};

		function updateDataChangeRefreshers(
			{ change }: TaggedChange<ModularChangeset>,
			getDetachedNode: (id: DeltaDetachedNodeId) => TreeChunk | undefined,
			removedRoots: Iterable<DeltaDetachedNodeId>,
			allowMissingRefreshers: boolean,
		): ModularChangeset {
			const output: TreeChunk[] = [];
			const relevantToChange = new Set<string>(change as unknown as string[]);
			for (const id of removedRoots) {
				// Check that the removed root is indeed relevant to the change
				assert.equal(relevantToChange.has(id as unknown as string), true);
				const tree = getDetachedNode(id);
				if (tree === undefined) {
					if (!allowMissingRefreshers) {
						throw new Error("Missing tree");
					}
				} else {
					output.push(tree);
				}
			}
			return output as unknown as ModularChangeset;
		}
		function testUpdateRefreshers(input: SharedTreeChange): SharedTreeChange {
			deepFreeze(input);
			return updateRefreshers(
				makeAnonChange(input),
				// Mock for getDetachedNode
				(id): TreeChunk | undefined => {
					switch (id) {
						case idInForest1:
							return refresher1;
						case idInForest2:
							return refresher2;
						default:
							return undefined;
					}
				},
				// Mock for relevantRemovedRootsFromDataChange
				({ change }: TaggedChange<ModularChangeset>): DeltaDetachedNodeId[] =>
					change as unknown as DeltaDetachedNodeId[],
				updateDataChangeRefreshers,
			);
		}
		it("updates all data changes", () => {
			const input: SharedTreeChange = {
				changes: [
					{ innerChange: [idInForest1] as any, type: "data" },
					schemaChange,
					{ innerChange: [idInForest2] as any, type: "data" },
				],
			};
			const updated = testUpdateRefreshers(input);
			assert.deepEqual(updated, {
				changes: [
					{ innerChange: [refresher1], type: "data" },
					schemaChange,
					{ innerChange: [refresher2], type: "data" },
				],
			});
		});
		it("excludes refreshers from later changes if they are included in earlier changes", () => {
			const input: SharedTreeChange = {
				changes: [
					{ innerChange: [idInForest1] as any, type: "data" },
					schemaChange,
					{ innerChange: [idInForest1, idInForest2] as any, type: "data" },
					schemaChange,
					{ innerChange: [idInForest1, idInForest2] as any, type: "data" },
				],
			};
			const updated = testUpdateRefreshers(input);
			assert.deepEqual(updated, {
				changes: [
					{ innerChange: [refresher1], type: "data" },
					schemaChange,
					{ innerChange: [refresher2], type: "data" },
					schemaChange,
					{ innerChange: [], type: "data" },
				],
			});
		});
		it("throws for missing refreshers in first data change", () => {
			const input: SharedTreeChange = {
				changes: [{ innerChange: [idNotInForest] as any, type: "data" }],
			};
			assert.throws(() => testUpdateRefreshers(input));
		});
		it("tolerates missing refreshers in later data changes", () => {
			const input: SharedTreeChange = {
				changes: [
					{ innerChange: [idInForest1] as any, type: "data" },
					schemaChange,
					{ innerChange: [idNotInForest, idInForest2] as any, type: "data" },
				],
			};
			const updated = testUpdateRefreshers(input);
			assert.deepEqual(updated, {
				changes: [
					{ innerChange: [refresher1], type: "data" },
					schemaChange,
					{ innerChange: [refresher2], type: "data" },
				],
			});
		});
	});
});
