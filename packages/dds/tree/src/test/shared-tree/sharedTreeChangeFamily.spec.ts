/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";
import { currentVersion, type CodecWriteOptions } from "../../codec/index.js";
import {
	type DeltaDetachedNodeId,
	type TreeStoredSchema,
	makeAnonChange,
	revisionMetadataSourceFromInfo,
	rootFieldKey,
	tagChange,
} from "../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { forbidden } from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import {
	DefaultEditBuilder,
	ModularChangeFamily,
	type ModularChangeset,
	type TreeChunk,
	fieldKinds,
	type SchemaChange,
	intoDelta,
	DefaultRevisionReplacer,
} from "../../feature-libraries/index.js";
import {
	SharedTreeChangeFamily,
	updateRefreshers,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree/sharedTreeChangeFamily.js";
import type {
	SharedTreeChange,
	SharedTreeInnerChange,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree/sharedTreeChangeTypes.js";
import { ajvValidator } from "../codec/index.js";
import {
	chunkFromJsonTrees,
	failCodecFamily,
	mintRevisionTag,
	testRevisionTagCodec,
} from "../utils.js";

const dataChanges: ModularChangeset[] = [];
const codecOptions: CodecWriteOptions = {
	jsonValidator: ajvValidator,
	minVersionForCollab: currentVersion,
};
const fieldBatchCodec = {
	encode: () => assert.fail("Unexpected encode"),
	decode: () => assert.fail("Unexpected decode"),
};

const modularFamily = new ModularChangeFamily(fieldKinds, failCodecFamily, codecOptions);
const defaultEditor = new DefaultEditBuilder(
	modularFamily,
	mintRevisionTag,
	(taggedChange) => dataChanges.push(taggedChange.change),
	codecOptions,
);

const rootField = { parent: undefined, field: rootFieldKey };
// Side effects results in `dataChanges` being populated
// The enter/exit transaction calls are used to ensure the first two change use the same local IDs in their change atoms.
// Specifically, `exitTransaction` resets the local ID space.
defaultEditor.enterTransaction();
defaultEditor.valueField(rootField).set(chunkFromJsonTrees(["X"]));
defaultEditor.exitTransaction();
defaultEditor.valueField(rootField).set(chunkFromJsonTrees(["Y"]));
defaultEditor.sequenceField(rootField).remove(0, 1);
defaultEditor.move(rootField, 0, 1, rootField, 0);

const dataChange1 = dataChanges[0];
const dataChange2 = dataChanges[1];
const dataChange3 = dataChanges[2];
const dataChange4 = dataChanges[3];
// This rebased change now refers to an ID introduced in dataChange3
const rebasedDataChange4 = modularFamily.rebaser.rebase(
	makeAnonChange(dataChange4),
	makeAnonChange(dataChange3),
	revisionMetadataSourceFromInfo([]),
);

const stDataChange1: SharedTreeChange = {
	changes: [{ type: "data", innerChange: dataChange1 }],
};
const stDataChange2: SharedTreeChange = {
	changes: [{ type: "data", innerChange: dataChange2 }],
};
const emptySchema: TreeStoredSchema = {
	nodeSchema: new Map(),
	rootFieldSchema: {
		kind: forbidden.identifier,
		types: new Set(),
		persistedMetadata: undefined,
	},
};
const innerSchemaChange = { schema: { new: emptySchema, old: emptySchema }, isInverse: false };
const stSchemaChange: SharedTreeChange = {
	changes: [{ type: "schema", innerChange: innerSchemaChange }],
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
				makeAnonChange(stSchemaChange),
				makeAnonChange(stEmptyChange),
				revisionMetadataSourceFromInfo([]),
			),
			stSchemaChange,
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				makeAnonChange(stDataChange1),
				makeAnonChange(stEmptyChange),
				revisionMetadataSourceFromInfo([]),
			),
			stDataChange1,
		);
	});

	it("schema edits cause all concurrent changes to conflict", () => {
		assert.deepEqual(
			sharedTreeFamily.rebase(
				makeAnonChange(stSchemaChange),
				makeAnonChange(stDataChange1),
				revisionMetadataSourceFromInfo([]),
			),
			{
				changes: [],
			},
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				makeAnonChange(stDataChange1),
				makeAnonChange(stSchemaChange),
				revisionMetadataSourceFromInfo([]),
			),
			{
				changes: [],
			},
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				makeAnonChange(stSchemaChange),
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
					makeAnonChange(stDataChange1),
					makeAnonChange(stDataChange2),
					revisionMetadataSourceFromInfo([]),
				),
				{
					changes: [
						{
							type: "data",
							innerChange: modularFamily.rebase(
								makeAnonChange(dataChange1),
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
				const tag = mintRevisionTag();
				const inverted = sharedTreeFamily.invert(
					makeAnonChange(stDataChange1),
					isRollback,
					tag,
				);

				const expected = {
					changes: [
						{
							type: "data",
							innerChange: modularFamily.invert(makeAnonChange(dataChange1), isRollback, tag),
						},
					],
				};

				assert.deepEqual(inverted, expected);
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
		const refresher1: TreeChunk = "refresher1" as unknown as TreeChunk;
		const refresher2: TreeChunk = "refresher2" as unknown as TreeChunk;
		const schemaChange: SharedTreeInnerChange = {
			type: "schema",
			innerChange: "MockSchemaChange" as unknown as SchemaChange,
		};

		function updateDataChangeRefreshers(
			change: ModularChangeset,
			getDetachedNode: (id: DeltaDetachedNodeId) => TreeChunk | undefined,
			removedRoots: Iterable<DeltaDetachedNodeId>,
			requireRefreshers: boolean,
		): ModularChangeset {
			const output: TreeChunk[] = [];
			const relevantToChange = new Set<string>(change as unknown as string[]);
			for (const id of removedRoots) {
				// Check that the removed root is indeed relevant to the change
				assert.equal(relevantToChange.has(id as unknown as string), true);
				const tree = getDetachedNode(id);
				if (tree === undefined) {
					if (requireRefreshers) {
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
				input,
				// Mock for getDetachedNode
				(id): TreeChunk | undefined => {
					switch (id) {
						case idInForest1: {
							return refresher1;
						}
						case idInForest2: {
							return refresher2;
						}
						default: {
							return undefined;
						}
					}
				},
				// Mock for relevantRemovedRootsFromDataChange
				(change: ModularChangeset): DeltaDetachedNodeId[] =>
					change as unknown as DeltaDetachedNodeId[],
				updateDataChangeRefreshers,
			);
		}
		it("updates all data changes", () => {
			const input: SharedTreeChange = {
				changes: [
					{ innerChange: [idInForest1] as unknown as ModularChangeset, type: "data" },
					schemaChange,
					{ innerChange: [idInForest2] as unknown as ModularChangeset, type: "data" },
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
					{ innerChange: [idInForest1] as unknown as ModularChangeset, type: "data" },
					schemaChange,
					{
						innerChange: [idInForest1, idInForest2] as unknown as ModularChangeset,
						type: "data",
					},
					schemaChange,
					{
						innerChange: [idInForest1, idInForest2] as unknown as ModularChangeset,
						type: "data",
					},
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
				changes: [
					{ innerChange: [idNotInForest] as unknown as ModularChangeset, type: "data" },
				],
			};
			assert.throws(() => testUpdateRefreshers(input));
		});
		it("tolerates missing refreshers in later data changes", () => {
			const input: SharedTreeChange = {
				changes: [
					{ innerChange: [idInForest1] as unknown as ModularChangeset, type: "data" },
					schemaChange,
					{
						innerChange: [idNotInForest, idInForest2] as unknown as ModularChangeset,
						type: "data",
					},
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

	describe("changeRevision", () => {
		it("handles local ID collisions across separate changes", () => {
			function getIds(change: SharedTreeChange): [DeltaDetachedNodeId, DeltaDetachedNodeId] {
				const change1 = change.changes[0];
				const change3 = change.changes[2];
				assert.equal(change1.type, "data");
				assert.equal(change3.type, "data");
				const delta1 = intoDelta(tagChange(change1.innerChange, undefined));
				const delta3 = intoDelta(tagChange(change3.innerChange, undefined));
				const id1 = delta1.build?.[0]?.id ?? fail("Missing id");
				const id3 = delta3.build?.[0]?.id ?? fail("Missing id");
				return [id1, id3];
			}
			const input: SharedTreeChange = {
				changes: [
					{ type: "data", innerChange: dataChange1 },
					{ type: "schema", innerChange: innerSchemaChange },
					{ type: "data", innerChange: dataChange2 },
				],
			};
			// Check the test setup is correct
			{
				const [a, b] = getIds(input);
				assert.notEqual(a.major, b.major);
				assert.equal(a.minor, b.minor);
			}
			const newRevision = mintRevisionTag();
			const updated = sharedTreeFamily.changeRevision(
				input,
				new DefaultRevisionReplacer(newRevision, sharedTreeFamily.getRevisions(input)),
			);
			// Check the revision change had the intended effect
			{
				const [a, b] = getIds(updated);
				assert.equal(a.major, newRevision);
				assert.equal(b.major, newRevision);
				assert.notEqual(a.minor, b.minor);
			}
		});

		it("keeps atom IDs consistent across separate changes", () => {
			function checkConsistency(change: SharedTreeChange): void {
				const change1 = change.changes[0];
				const change3 = change.changes[2];
				assert.equal(change1.type, "data");
				assert.equal(change3.type, "data");
				const delta1 = intoDelta(tagChange(change1.innerChange, undefined));
				const delta3 = intoDelta(tagChange(change3.innerChange, undefined));
				const detachedNodeId = delta1.fields?.get(rootFieldKey)?.[0]?.detach;
				const reference = delta3.rename?.[0]?.oldId;
				assert.notEqual(reference, undefined);
				assert.deepEqual(reference, detachedNodeId);
			}
			const input: SharedTreeChange = {
				changes: [
					{ type: "data", innerChange: dataChange3 },
					{ type: "schema", innerChange: innerSchemaChange },
					{ type: "data", innerChange: rebasedDataChange4 },
				],
			};
			checkConsistency(input);
			const newRevision = mintRevisionTag();
			const updated = sharedTreeFamily.changeRevision(
				input,
				new DefaultRevisionReplacer(newRevision, sharedTreeFamily.getRevisions(input)),
			);
			checkConsistency(updated);
		});
	});
});
