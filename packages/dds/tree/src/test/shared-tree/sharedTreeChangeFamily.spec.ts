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
	type FieldBatchCodec,
	FieldBatchFormatVersion,
} from "../../feature-libraries/index.js";
import {
	ConstraintStatus,
	getConstraintStatus,
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

const modularChanges: ModularChangeset[] = [];
const codecOptions: CodecWriteOptions = {
	jsonValidator: ajvValidator,
	minVersionForCollab: currentVersion,
};
const fieldBatchCodec: FieldBatchCodec = {
	encode: () => assert.fail("Unexpected encode"),
	decode: () => assert.fail("Unexpected decode"),
	writeVersion: FieldBatchFormatVersion.v2,
};

const modularFamily = new ModularChangeFamily(fieldKinds, failCodecFamily, codecOptions);
const defaultEditor = new DefaultEditBuilder(
	modularFamily,
	mintRevisionTag,
	(taggedChange) => modularChanges.push(taggedChange.change),
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
defaultEditor.addNoChangeConstraint();

const modularDataChange1 = modularChanges[0];
const modularDataChange2 = modularChanges[1];
const modularDataChange3 = modularChanges[2];
const modularDataChange4 = modularChanges[3];
const modularConstraint = modularChanges[4];
// This rebased change now refers to an ID introduced in dataChange3
const rebasedDataChange4 = modularFamily.rebaser.rebase(
	makeAnonChange(modularDataChange4),
	makeAnonChange(modularDataChange3),
	revisionMetadataSourceFromInfo([]),
);

const treeDataChange1: SharedTreeChange = {
	changes: [{ type: "data", innerChange: modularDataChange1 }],
};
const treeDataChange2: SharedTreeChange = {
	changes: [{ type: "data", innerChange: modularDataChange2 }],
};
const treeConstraint: SharedTreeChange = {
	changes: [{ type: "data", innerChange: modularConstraint }],
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
const treeSchemaChange: SharedTreeChange = {
	changes: [{ type: "schema", innerChange: innerSchemaChange }],
};
const emptyTreeChange: SharedTreeChange = {
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
				makeAnonChange(treeDataChange1),
				makeAnonChange(treeDataChange2),
				makeAnonChange(treeSchemaChange),
				makeAnonChange(treeDataChange1),
				makeAnonChange(treeDataChange2),
				makeAnonChange(treeDataChange2),
			]),
			{
				changes: [
					{
						type: "data",
						innerChange: modularFamily.compose([
							makeAnonChange(modularDataChange1),
							makeAnonChange(modularDataChange2),
						]),
					},
					treeSchemaChange.changes[0],
					{
						type: "data",
						innerChange: modularFamily.compose([
							makeAnonChange(modularDataChange1),
							makeAnonChange(modularDataChange2),
							makeAnonChange(modularDataChange2),
						]),
					},
				],
			},
		);
	});

	it("empty changes result in no-op rebases", () => {
		assert.deepEqual(
			sharedTreeFamily.rebase(
				makeAnonChange(treeSchemaChange),
				makeAnonChange(emptyTreeChange),
				revisionMetadataSourceFromInfo([]),
			),
			treeSchemaChange,
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				makeAnonChange(treeDataChange1),
				makeAnonChange(emptyTreeChange),
				revisionMetadataSourceFromInfo([]),
			),
			treeDataChange1,
		);
	});

	it("schema edits cause all concurrent changes to conflict", () => {
		assert.deepEqual(
			sharedTreeFamily.rebase(
				makeAnonChange(treeSchemaChange),
				makeAnonChange(treeDataChange1),
				revisionMetadataSourceFromInfo([]),
			),
			{
				changes: [],
			},
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				makeAnonChange(treeDataChange1),
				makeAnonChange(treeSchemaChange),
				revisionMetadataSourceFromInfo([]),
			),
			{
				changes: [],
			},
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				makeAnonChange(treeSchemaChange),
				makeAnonChange(treeSchemaChange),
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
					makeAnonChange(treeDataChange1),
					makeAnonChange(treeDataChange2),
				]),
				{
					changes: [
						{
							type: "data",
							innerChange: modularFamily.compose([
								makeAnonChange(modularDataChange1),
								makeAnonChange(modularDataChange2),
							]),
						},
					],
				},
			);
		});

		it("when rebasing", () => {
			assert.deepEqual(
				sharedTreeFamily.rebase(
					makeAnonChange(treeDataChange1),
					makeAnonChange(treeDataChange2),
					revisionMetadataSourceFromInfo([]),
				),
				{
					changes: [
						{
							type: "data",
							innerChange: modularFamily.rebase(
								makeAnonChange(modularDataChange1),
								makeAnonChange(modularDataChange2),
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
					makeAnonChange(treeDataChange1),
					isRollback,
					tag,
				);

				const expected = {
					changes: [
						{
							type: "data",
							innerChange: modularFamily.invert(
								makeAnonChange(modularDataChange1),
								isRollback,
								tag,
							),
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
		interface MockChange {
			/** The IDs of the nodes that are relevant to this change. This is the test input. */
			readonly relevant?: DeltaDetachedNodeId[];
			/** The refreshers associated with this change. This is the test output. */
			readonly refreshers?: string[];
		}

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
			const mockChange = change as unknown as MockChange;
			const relevantToChange = new Set<DeltaDetachedNodeId>(mockChange.relevant ?? []);
			const refreshers: string[] = [];
			for (const id of removedRoots) {
				// Check that the removed root is indeed relevant to the change
				assert.equal(relevantToChange.has(id), true);
				const tree = getDetachedNode(id);
				if (tree === undefined) {
					if (requireRefreshers) {
						throw new Error("Missing tree");
					}
				} else {
					refreshers.push(tree as unknown as string);
				}
			}
			const updated: MockChange = {
				...mockChange,
				refreshers,
			};
			return updated as unknown as ModularChangeset;
		}
		function testUpdateRefreshers(mocks: readonly MockChange[]): string[][] {
			const input: SharedTreeChange = sharedTreeChangeFromMocks(mocks);
			deepFreeze(input);
			const updated = updateRefreshers(
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
					(change as unknown as MockChange).relevant ?? [],
				updateDataChangeRefreshers,
			);
			return refreshersFromSharedTreeChange(updated);
		}
		function sharedTreeChangeFromMocks(mocks: readonly MockChange[]): SharedTreeChange {
			const changes: SharedTreeInnerChange[] = [];
			for (const mock of mocks) {
				changes.push({
					type: "data",
					innerChange: mock as unknown as ModularChangeset,
				});
				changes.push(schemaChange);
			}
			return { changes };
		}
		function refreshersFromSharedTreeChange(change: SharedTreeChange): string[][] {
			const result: string[][] = [];
			for (const innerChange of change.changes) {
				if (innerChange.type === "data") {
					const mockChange = innerChange.innerChange as unknown as MockChange;
					result.push(mockChange.refreshers ?? []);
				}
			}
			return result;
		}

		it("updates all data changes", () => {
			const input: MockChange[] = [{ relevant: [idInForest1] }, { relevant: [idInForest2] }];
			const updated = testUpdateRefreshers(input);
			assert.deepEqual(updated, [[refresher1], [refresher2]]);
		});
		it("excludes refreshers from later changes if they are included in earlier changes", () => {
			const input: MockChange[] = [
				{ relevant: [idInForest1] },
				{ relevant: [idInForest1, idInForest2] },
				{ relevant: [idInForest1, idInForest2] },
			];
			const updated = testUpdateRefreshers(input);
			assert.deepEqual(updated, [[refresher1], [refresher2], []]);
		});
		it("throws for missing refreshers in first data change", () => {
			const input: MockChange[] = [{ relevant: [idNotInForest] }];
			assert.throws(() => testUpdateRefreshers(input));
		});
		it("tolerates missing refreshers in later data changes", () => {
			const input: MockChange[] = [
				{ relevant: [idInForest1] },
				{ relevant: [idNotInForest, idInForest2] },
			];
			const updated = testUpdateRefreshers(input);
			assert.deepEqual(updated, [[refresher1], [refresher2]]);
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
					{ type: "data", innerChange: modularDataChange1 },
					{ type: "schema", innerChange: innerSchemaChange },
					{ type: "data", innerChange: modularDataChange2 },
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
				const detachedNodeId = delta1.fields?.get(rootFieldKey)?.marks[0]?.detach;
				const reference = delta3.rename?.[0]?.oldId;
				assert.notEqual(reference, undefined);
				assert.deepEqual(reference, detachedNodeId);
			}
			const input: SharedTreeChange = {
				changes: [
					{ type: "data", innerChange: modularDataChange3 },
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
	describe("getConstraintStatus", () => {
		it("returns Satisfied for a change that has no constraint violations", () => {
			const status = getConstraintStatus(treeDataChange1);
			assert.equal(status, ConstraintStatus.Satisfied);
		});
		it("returns ExplicitViolation for a change that has explicit constraint violations", () => {
			const hasViolatedExplicitConstraint = sharedTreeFamily.rebaser.rebase(
				makeAnonChange(treeConstraint),
				makeAnonChange(treeDataChange1),
				revisionMetadataSourceFromInfo([]),
			);
			const status = getConstraintStatus(hasViolatedExplicitConstraint);
			assert.equal(status, ConstraintStatus.ExplicitViolation);
		});
		it("returns ImplicitViolation for a data change rebased over a schema change", () => {
			const dataOverSchema = sharedTreeFamily.rebaser.rebase(
				makeAnonChange(treeDataChange1),
				makeAnonChange(treeSchemaChange),
				revisionMetadataSourceFromInfo([]),
			);
			const status = getConstraintStatus(dataOverSchema);
			assert.equal(status, ConstraintStatus.ImplicitViolation);
		});
		it("returns ImplicitViolation for a schema change rebased over a data change", () => {
			const schemaOverData = sharedTreeFamily.rebaser.rebase(
				makeAnonChange(treeSchemaChange),
				makeAnonChange(treeDataChange1),
				revisionMetadataSourceFromInfo([]),
			);
			const status = getConstraintStatus(schemaOverData);
			assert.equal(status, ConstraintStatus.ImplicitViolation);
		});
		it("returns ImplicitViolation for a schema change rebased over a schema change", () => {
			const schemaOverSchema = sharedTreeFamily.rebaser.rebase(
				makeAnonChange(treeSchemaChange),
				makeAnonChange(treeSchemaChange),
				revisionMetadataSourceFromInfo([]),
			);
			const status = getConstraintStatus(schemaOverSchema);
			assert.equal(status, ConstraintStatus.ImplicitViolation);
		});
		it("returns ImplicitViolation for a data change with a violated constraint that is rebased over a schema change", () => {
			const hasViolatedExplicitConstraint = sharedTreeFamily.rebaser.rebase(
				makeAnonChange(treeConstraint),
				makeAnonChange(treeDataChange1),
				revisionMetadataSourceFromInfo([]),
			);
			const hasBothKindsOfViolations = sharedTreeFamily.rebaser.rebase(
				makeAnonChange(hasViolatedExplicitConstraint),
				makeAnonChange(treeSchemaChange),
				revisionMetadataSourceFromInfo([]),
			);
			const status = getConstraintStatus(hasBothKindsOfViolations);
			assert.equal(status, ConstraintStatus.ImplicitViolation);
		});
	});
});
