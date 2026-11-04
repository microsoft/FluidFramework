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
import { SchemaFactory, toInitialSchema } from "../../simple-tree/index.js";
import { ajvValidator } from "../codec/index.js";
import {
	chunkFromJsonTrees,
	failCodecFamily,
	mintRevisionTag,
	testChangeReceiver,
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
const stringSchema = toInitialSchema(SchemaFactory.string);
const stringNumberSchema = toInitialSchema([SchemaFactory.string, SchemaFactory.number]);
const stringBooleanSchema = toInitialSchema([SchemaFactory.string, SchemaFactory.boolean]);
const stringNumberBooleanSchema = toInitialSchema([
	SchemaFactory.string,
	SchemaFactory.number,
	SchemaFactory.boolean,
]);
const innerSchemaChange = {
	schema: { old: stringSchema, new: stringNumberSchema },
	isInverse: false,
};
const treeSchemaChange: SharedTreeChange = {
	changes: [{ type: "schema", innerChange: innerSchemaChange }],
};
const treeSchemaChange2: SharedTreeChange = {
	changes: [
		{
			type: "schema",
			innerChange: {
				schema: { old: stringNumberSchema, new: stringNumberBooleanSchema },
				isInverse: false,
			},
		},
	],
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
	const changeCases = {
		_: { changes: [] }, // No changes
		C: { changes: [treeDataChange1.changes[0]] }, // Content change
		S: { changes: [treeSchemaChange.changes[0]] }, // Schema change
		CS: { changes: [treeDataChange1.changes[0], treeSchemaChange.changes[0]] },
		SC: { changes: [treeSchemaChange.changes[0], treeDataChange2.changes[0]] },
		CSC: {
			changes: [
				treeDataChange1.changes[0],
				treeSchemaChange.changes[0],
				treeDataChange2.changes[0],
			],
		},
		SCS: {
			changes: [
				treeSchemaChange.changes[0],
				treeDataChange1.changes[0],
				treeSchemaChange2.changes[0],
			],
		},
		SS: { changes: [treeSchemaChange.changes[0], treeSchemaChange2.changes[0]] },
	} as const satisfies Record<string, SharedTreeChange>;

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

	it("composition without schema changes matches ModularChangeFamily", () => {
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

	describe("rebase", () => {
		const metadata = revisionMetadataSourceFromInfo([]);

		describe("change cases", () => {
			for (const [shape, forwardChange] of Object.entries(changeCases)) {
				for (const [overShape, overChange] of Object.entries(changeCases)) {
					for (const isRollback of [false, true]) {
						it(`${shape} over ${overShape}${isRollback ? " (rollback)" : ""}`, () => {
							const change = isRollback
								? sharedTreeFamily.invert(
										makeAnonChange(forwardChange),
										true,
										mintRevisionTag(),
									)
								: forwardChange;

							const over = isRollback
								? sharedTreeFamily.invert(
										makeAnonChange(
											overChange === changeCases.C ? treeDataChange2 : overChange,
										),
										true,
										mintRevisionTag(),
									)
								: overChange === changeCases.C
									? treeDataChange2
									: overChange;

							let expected: SharedTreeChange;
							if (forwardChange === changeCases._ || overChange === changeCases._) {
								expected = change;
							} else if (forwardChange === changeCases.C && overChange === changeCases.C) {
								const content = change.changes[0];
								const overContent = over.changes[0];
								assert(content.type === "data" && overContent.type === "data");
								expected = {
									changes: [
										{
											type: "data",
											innerChange: modularFamily.rebase(
												makeAnonChange(content.innerChange),
												makeAnonChange(overContent.innerChange),
												metadata,
											),
										},
									],
								};
							} else {
								expected = emptyTreeChange;
							}
							const rebased = sharedTreeFamily.rebase(
								makeAnonChange(change),
								makeAnonChange(over),
								metadata,
							);
							assert.deepEqual(rebased, expected);
							assert.equal(
								getConstraintStatus(rebased),
								expected.changes.length === 0
									? ConstraintStatus.ImplicitViolation
									: ConstraintStatus.Satisfied,
							);
						});
					}
				}
			}
		});

		describe("schema relationships", () => {
			const cases: readonly [string, TreeStoredSchema, TreeStoredSchema][] = [
				["equal", stringBooleanSchema, stringBooleanSchema],
				["strict superset", stringBooleanSchema, stringSchema],
				["strict subset", stringSchema, stringBooleanSchema],
				["divergent", stringNumberSchema, stringBooleanSchema],
			];
			for (const [name, proposed, overSchema] of cases) {
				it(`drops schema changes with ${name} outputs`, () => {
					const [receive, getChanges] = testChangeReceiver(sharedTreeFamily);
					const editor = sharedTreeFamily.buildEditor(mintRevisionTag, receive);
					editor.schema.setStoredSchema(stringSchema, proposed);
					editor.schema.setStoredSchema(stringSchema, overSchema);
					const [change, over] = getChanges();
					const rebased = sharedTreeFamily.rebase(
						makeAnonChange(change),
						makeAnonChange(over),
						metadata,
					);
					assert.deepEqual(rebased, emptyTreeChange);
					assert.equal(getConstraintStatus(rebased), ConstraintStatus.ImplicitViolation);
				});
			}
		});

		const constrainedData = modularFamily.compose([
			makeAnonChange(modularConstraint),
			makeAnonChange(modularDataChange1),
		]);
		const violatedData = modularFamily.rebase(
			makeAnonChange(constrainedData),
			makeAnonChange(modularDataChange2),
			metadata,
		);

		describe("no-change constraints", () => {
			for (const [state, innerChange] of [
				["satisfied", constrainedData],
				["violated", violatedData],
			] as const) {
				for (const [overShape, over] of [
					["_", emptyTreeChange],
					["C", treeDataChange2],
					["S", treeSchemaChange],
				] as const) {
					for (const ignoreNoChangeViolation of [undefined, true]) {
						it(`${state} constraint over ${overShape}, ignoreNoChangeViolation = ${ignoreNoChangeViolation ?? "default"}`, () => {
							const change: SharedTreeChange = {
								changes: [{ type: "data", innerChange }],
							};
							const rebased = sharedTreeFamily.rebase(
								makeAnonChange(change),
								makeAnonChange(over),
								metadata,
								ignoreNoChangeViolation,
							);
							const expected: SharedTreeChange =
								over === emptyTreeChange
									? change
									: over === treeSchemaChange
										? emptyTreeChange
										: {
												changes: [
													{
														type: "data",
														innerChange: modularFamily.rebase(
															makeAnonChange(innerChange),
															makeAnonChange(modularDataChange2),
															metadata,
															ignoreNoChangeViolation,
														),
													},
												],
											};
							assert.deepEqual(rebased, expected);
							assert.equal(
								getConstraintStatus(rebased),
								over === treeSchemaChange
									? ConstraintStatus.ImplicitViolation
									: state === "violated" ||
											(over === treeDataChange2 && !ignoreNoChangeViolation)
										? ConstraintStatus.ExplicitViolation
										: ConstraintStatus.Satisfied,
							);
						});
					}
				}
			}
		});

		describe("no-effect and conflicted changes", () => {
			const emptyContent: SharedTreeChange = {
				changes: [{ type: "data", innerChange: modularFamily.compose([]) }],
			};
			const identitySchema: SharedTreeChange = {
				changes: [
					{
						type: "schema",
						innerChange: {
							schema: { old: stringSchema, new: stringSchema },
							isInverse: false,
						},
					},
				],
			};
			const cases: readonly [string, SharedTreeChange, SharedTreeChange, SharedTreeChange][] =
				[
					// S = schema change, C = content change, _ = empty change
					["empty content over _", emptyContent, emptyTreeChange, emptyContent],
					["empty content over S", emptyContent, treeSchemaChange, emptyTreeChange],
					["S over empty content", treeSchemaChange, emptyContent, emptyTreeChange],
					["identity schema over C", identitySchema, treeDataChange1, emptyTreeChange],
					["C over identity schema", treeDataChange1, identitySchema, emptyTreeChange],
					[
						"S over explicitly conflicted content",
						treeSchemaChange,
						{ changes: [{ type: "data", innerChange: violatedData }] },
						emptyTreeChange,
					],
				];
			for (const [name, change, over, expected] of cases) {
				it(name, () => {
					const rebased = sharedTreeFamily.rebase(
						makeAnonChange(change),
						makeAnonChange(over),
						metadata,
					);
					assert.deepEqual(rebased, expected);
					assert.equal(
						getConstraintStatus(rebased),
						expected.changes.length === 0
							? ConstraintStatus.ImplicitViolation
							: ConstraintStatus.Satisfied,
					);
				});
			}
		});

		describe("successive rebases", () => {
			const schemaRollback = sharedTreeFamily.invert(
				makeAnonChange(treeSchemaChange),
				true,
				mintRevisionTag(),
			);
			for (const [name, first, second] of [
				["upgrade then rollback", treeSchemaChange, schemaRollback],
				["rollback then upgrade", schemaRollback, treeSchemaChange],
			] as const) {
				it(`does not restore dropped content after ${name}`, () => {
					let rebased = treeDataChange1;
					for (const over of [first, second]) {
						rebased = sharedTreeFamily.rebase(
							makeAnonChange(rebased),
							makeAnonChange(over),
							metadata,
						);
						assert.deepEqual(rebased, emptyTreeChange);
						assert.equal(getConstraintStatus(rebased), ConstraintStatus.ImplicitViolation);
					}
				});
			}
		});
	});

	describe("invert", () => {
		for (const [shape, change] of Object.entries(changeCases)) {
			for (const isRollback of [false, true]) {
				it(`${shape}, isRollback = ${isRollback}`, () => {
					const revision = mintRevisionTag();
					const inverseRevision = mintRevisionTag();
					const inverted = sharedTreeFamily.invert(
						tagChange(change, revision),
						isRollback,
						inverseRevision,
					);
					const expected: SharedTreeChange = {
						changes: change.changes
							.map(
								(inner): SharedTreeInnerChange =>
									inner.type === "data"
										? {
												type: "data",
												innerChange: modularFamily.invert(
													tagChange(inner.innerChange, revision),
													isRollback,
													inverseRevision,
												),
											}
										: {
												type: "schema",
												innerChange: {
													schema: {
														old: inner.innerChange.schema.new,
														new: inner.innerChange.schema.old,
													},
													isInverse: true,
												},
											},
							)
							.reverse(),
					};
					assert.deepEqual(inverted, expected);
					assert.equal(
						getConstraintStatus(inverted),
						change === changeCases._
							? ConstraintStatus.ImplicitViolation
							: ConstraintStatus.Satisfied,
					);
				});
			}
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
});
