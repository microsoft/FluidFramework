/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	IEditableForest,
	initializeForest,
	moveToDetachedField,
	TreeNavigationResult,
	InMemoryStoredSchemaRepository,
	StoredSchemaRepository,
	FieldKey,
	JsonableTree,
	mapCursorField,
	rootFieldKey,
	UpPath,
	clonePath,
	ITreeCursor,
	EmptyKey,
	FieldUpPath,
	deltaForSet,
	DetachedFieldIndex,
	ForestRootId,
	DetachedField,
	detachedFieldAsKey,
	DeltaFieldChanges,
	DeltaMark,
	DeltaFieldMap,
} from "../core";
import {
	cursorToJsonObject,
	jsonSchema,
	jsonRoot,
	singleJsonCursor,
	SchemaBuilder,
	leaf,
} from "../domains";
import { IdAllocator, JsonCompatible, brand, idAllocatorFromMaxId, mapIterable } from "../util";
import {
	FieldKinds,
	jsonableTreeFromCursor,
	cursorForJsonableTreeNode,
	defaultSchemaPolicy,
	isNeverField,
	cursorForTypedTreeData,
	TreeFieldSchema,
	intoStoredSchema,
} from "../feature-libraries";
import {
	applyTestDelta,
	expectEqualFieldPaths,
	expectEqualPaths,
	jsonSequenceRootSchema,
} from "./utils";
import { testGeneralPurposeTreeCursor, testTreeSchema } from "./cursorTestSuite";

/**
 * Configuration for the forest test suite.
 */
export interface ForestTestConfiguration {
	suiteName: string;
	factory: (schema: StoredSchemaRepository) => IEditableForest;

	/**
	 * If true, skip the tests that ensure errors are thrown when applying deltas without clearing cursors.
	 *
	 * @remarks Errors from current cursors during edits are not required by the Forest API specification,
	 * but are nice for debugging.
	 * Performance oriented forest implementations may opt out of this check.
	 * Applications wanting help debugging invalid forest API use should use cursors that include this check.
	 */
	skipCursorErrorCheck?: true;
}

const jsonDocumentSchema = new SchemaBuilder({
	scope: "jsonDocumentSchema",
	libraries: [jsonSchema],
}).intoSchema(SchemaBuilder.sequence(jsonRoot));

const buildId = { minor: 42 };
const buildId2 = { minor: 442 };
const detachId = { minor: 43 };

/**
 * Generic forest test suite
 */
export function testForest(config: ForestTestConfiguration): void {
	const factory = config.factory;
	describe(config.suiteName, () => {
		const nestedContent: JsonCompatible = {
			x: { foo: 2 },
			y: 1,
		};
		const xField = brand<FieldKey>("x");
		const yField = brand<FieldKey>("y");
		const fooField: FieldKey = brand("foo");

		// Use Json Cursor to insert and extract some Json data
		describe("insert and extract json", () => {
			// eslint-disable-next-line @typescript-eslint/ban-types
			const testCases: [string, {} | number][] = [
				["primitive", 5],
				["array", [1, 2, 3]],
				["object", { blah: "test" }],
				["nested objects", { blah: { foo: 5 }, baz: [{}, { foo: 3 }] }],
			];
			for (const [name, data] of testCases) {
				it(name, () => {
					const schema = new InMemoryStoredSchemaRepository();
					const forest = factory(schema);

					const rootFieldSchema = TreeFieldSchema.create(FieldKinds.optional, jsonRoot);
					schema.update({
						nodeSchema: new Map(
							mapIterable(jsonSchema.nodeSchema.entries(), ([k, v]) => [k, v.stored]),
						),
						rootFieldSchema,
					});

					// Check schema is actually valid. If we forgot to add some required types this would fail.
					assert(!isNeverField(defaultSchemaPolicy, schema, rootFieldSchema));

					initializeForest(forest, [singleJsonCursor(data)]);

					const reader = forest.allocateCursor();
					moveToDetachedField(forest, reader);

					// copy data from reader into json object and compare to data.
					const copy = mapCursorField(reader, cursorToJsonObject);
					reader.free();
					assert.deepEqual(copy, [data]);
				});
			}
		});

		it("cursor use", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(intoStoredSchema(jsonSequenceRootSchema)),
			);
			initializeForest(forest, [singleJsonCursor([1, 2])]);

			const reader = forest.allocateCursor();
			moveToDetachedField(forest, reader);
			const reader2 = reader.fork();
			// Make sure fork is initialized properly
			assert.deepEqual(reader.getFieldPath(), reader2.getFieldPath());
			assert(reader.firstNode());
			// Make sure forks can move independently
			assert.deepEqual(reader.getPath()?.parent, reader2.getFieldPath().parent);
			assert(reader2.firstNode());
			assert.deepEqual(reader.getPath(), reader2.getPath());
			reader.enterField(EmptyKey);
			reader.enterNode(1);
			assert.equal(reader.value, 2);
			// Move reader two down to the same place, but by a different route.
			reader2.enterField(EmptyKey);
			reader2.enterNode(0);
			assert.equal(reader2.value, 1);
			assert.equal(reader.value, 2);
			assert(reader2.nextNode());
			assert.equal(reader2.value, 2);
			// Test a fork with a longer path and at a node not a field.
			const reader3 = reader2.fork();
			assert.deepEqual(reader.getPath(), reader3.getPath());
			reader.free();
			reader2.free();
		});

		it("isEmpty: rootFieldKey", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
			);
			assert(forest.isEmpty);
			initializeForest(forest, [singleJsonCursor([])]);
			assert(!forest.isEmpty);
		});

		it("isEmpty: other root", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
			);
			assert(forest.isEmpty);

			const insert: DeltaFieldChanges = {
				build: [{ id: { minor: 1 }, trees: [singleJsonCursor([])] }],
				local: [{ count: 1, attach: { minor: 1 } }],
			};
			applyTestDelta(new Map([[brand("different root"), insert]]), forest);
			assert(!forest.isEmpty);
		});

		it("moving a cursor to the root of an empty forest fails", () => {
			const forest = factory(new InMemoryStoredSchemaRepository());
			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			assert.equal(cursor.firstNode(), false);
		});

		it("tryMoveCursorToNode", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
			);

			initializeForest(forest, [singleJsonCursor([1, 2])]);

			const parentPath: UpPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};

			const childPath1: UpPath = {
				parent: parentPath,
				parentField: EmptyKey,
				parentIndex: 0,
			};

			const childPath2: UpPath = {
				parent: parentPath,
				parentField: EmptyKey,
				parentIndex: 1,
			};

			const parentAnchor = forest.anchors.track(parentPath);
			const childAnchor1 = forest.anchors.track(childPath1);
			const childAnchor2 = forest.anchors.track(childPath2);

			const cursor = forest.allocateCursor();
			assert.equal(forest.tryMoveCursorToNode(parentAnchor, cursor), TreeNavigationResult.Ok);
			assert.equal(cursor.value, undefined);
			assert.equal(forest.tryMoveCursorToNode(childAnchor1, cursor), TreeNavigationResult.Ok);
			assert.equal(cursor.value, 1);
			assert.equal(forest.tryMoveCursorToNode(childAnchor2, cursor), TreeNavigationResult.Ok);
			assert.equal(cursor.value, 2);
		});

		it("tryMoveCursorToField", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
			);

			initializeForest(forest, [singleJsonCursor([1, 2])]);

			const parentPath: FieldUpPath = {
				parent: undefined,
				field: rootFieldKey,
			};

			const parentNodePath: UpPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};

			const childPath: FieldUpPath = {
				parent: parentNodePath,
				field: EmptyKey,
			};

			const parentAnchor = forest.anchors.track(parentNodePath);

			const cursor = forest.allocateCursor();
			assert.equal(
				forest.tryMoveCursorToField({ fieldKey: rootFieldKey, parent: undefined }, cursor),
				TreeNavigationResult.Ok,
			);

			expectEqualFieldPaths(cursor.getFieldPath(), parentPath);
			assert.equal(
				forest.tryMoveCursorToField({ fieldKey: EmptyKey, parent: parentAnchor }, cursor),
				TreeNavigationResult.Ok,
			);
			expectEqualFieldPaths(cursor.getFieldPath(), childPath);
		});

		describe("moveCursorToPath", () => {
			it("moves cursor to specified path.", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
				);
				initializeForest(forest, [singleJsonCursor([1, 2])]);

				const cursor = forest.allocateCursor();
				const path: UpPath = {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 0,
				};

				forest.moveCursorToPath(path, cursor);
				expectEqualPaths(path, cursor.getPath());
			});
		});

		it("getCursorAboveDetachedFields", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
			);
			initializeForest(forest, [singleJsonCursor([1, 2])]);

			const forestCursor = forest.allocateCursor();
			moveToDetachedField(forest, forestCursor);
			const expected = mapCursorField(forestCursor, jsonableTreeFromCursor);

			const cursor = forest.getCursorAboveDetachedFields();
			cursor.enterField(rootFieldKey);
			const actual = mapCursorField(cursor, jsonableTreeFromCursor);
			assert.deepEqual(actual, expected);
		});

		it("anchors creation and use", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
			);
			initializeForest(forest, [singleJsonCursor([1, 2])]);

			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			assert(cursor.firstNode());
			const parentAnchor = cursor.buildAnchor();
			cursor.enterField(EmptyKey);
			cursor.enterNode(0);
			assert.equal(cursor.value, 1);
			const childAnchor1 = cursor.buildAnchor();
			assert(cursor.nextNode());
			const childAnchor2 = cursor.buildAnchor();
			cursor.exitNode();
			cursor.exitField();
			const parentAnchor2 = cursor.buildAnchor();

			const parentPath = clonePath(forest.anchors.locate(parentAnchor));
			const childPath1 = clonePath(forest.anchors.locate(childAnchor1));
			const childPath2 = clonePath(forest.anchors.locate(childAnchor2));
			const parentPath2 = clonePath(forest.anchors.locate(parentAnchor2));

			const expectedParent: UpPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};

			assert.deepStrictEqual(parentPath, expectedParent);
			assert.deepStrictEqual(parentPath2, expectedParent);

			const expectedChild1: UpPath = {
				parent: expectedParent,
				parentField: EmptyKey,
				parentIndex: 0,
			};

			const expectedChild2: UpPath = {
				parent: expectedParent,
				parentField: EmptyKey,
				parentIndex: 1,
			};

			assert.deepStrictEqual(childPath1, expectedChild1);
			assert.deepStrictEqual(childPath2, expectedChild2);

			assert.equal(forest.tryMoveCursorToNode(parentAnchor, cursor), TreeNavigationResult.Ok);
			assert.equal(cursor.value, undefined);
			assert.equal(forest.tryMoveCursorToNode(childAnchor1, cursor), TreeNavigationResult.Ok);
			assert.equal(cursor.value, 1);
			assert.equal(forest.tryMoveCursorToNode(childAnchor2, cursor), TreeNavigationResult.Ok);
			assert.equal(cursor.value, 2);

			// Cleanup is not required for this test (since anchor set will go out of scope here),
			// But make sure it works:
			forest.anchors.forget(parentAnchor);
			forest.anchors.forget(childAnchor1);
			forest.anchors.forget(childAnchor2);
			forest.anchors.forget(parentAnchor2);
			assert(forest.anchors.isEmpty());
		});

		it("using an anchor that went away returns NotFound", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
			);

			initializeForest(forest, [singleJsonCursor([1, 2])]);

			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			assert(cursor.firstNode());
			cursor.enterField(EmptyKey);
			cursor.enterNode(0);
			const firstNodeAnchor = cursor.buildAnchor();
			cursor.clear();

			const mark: DeltaMark = { count: 1, detach: detachId };
			const delta: DeltaFieldMap = new Map([
				[rootFieldKey, { local: [mark], destroy: [{ id: detachId, count: 1 }] }],
			]);
			applyTestDelta(delta, forest);
			applyTestDelta(delta, forest.anchors);

			assert.equal(
				forest.tryMoveCursorToNode(firstNodeAnchor, cursor),
				TreeNavigationResult.NotFound,
			);
		});

		it("can destroy detached fields", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
			);
			const content: JsonCompatible[] = [1, 2];
			initializeForest(forest, content.map(singleJsonCursor));

			const mark: DeltaMark = {
				count: 1,
				detach: detachId,
			};
			const detachedFieldIndex = new DetachedFieldIndex(
				"test",
				idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
			);
			const delta: DeltaFieldMap = new Map<FieldKey, DeltaFieldChanges>([
				[rootFieldKey, { local: [mark] }],
			]);
			applyTestDelta(delta, forest, detachedFieldIndex);

			const detachedField: DetachedField = brand(
				detachedFieldIndex.toFieldKey(0 as ForestRootId),
			);
			// `1` should be under the detached field
			const reader = forest.allocateCursor();
			moveToDetachedField(forest, reader, detachedField);
			assert(reader.firstNode());
			assert.equal(reader.value, 1);
			assert.equal(reader.nextNode(), false);
			reader.clear();

			forest.acquireVisitor().destroy(detachedFieldAsKey(detachedField), 1);

			// check the detached field no longer exists
			const detachedCursor = forest.allocateCursor();
			moveToDetachedField(forest, detachedCursor, detachedField);
			assert.equal(detachedCursor.getFieldLength(), 0);
		});

		describe("can clone", () => {
			it("an empty forest", () => {
				const schema = new InMemoryStoredSchemaRepository();
				const forest = factory(schema);
				const clone = forest.clone(schema, forest.anchors);
				const reader = clone.allocateCursor();
				moveToDetachedField(clone, reader);
				// Expect no nodes under the detached field
				assert.equal(reader.firstNode(), false);
			});

			it("primitive nodes", () => {
				const schema = new InMemoryStoredSchemaRepository(
					intoStoredSchema(jsonDocumentSchema),
				);
				const forest = factory(schema);
				const content: JsonCompatible[] = [1, true, "test"];
				initializeForest(forest, content.map(singleJsonCursor));

				const clone = forest.clone(schema, forest.anchors);
				const reader = clone.allocateCursor();
				moveToDetachedField(clone, reader);
				assert(reader.firstNode());
				assert.equal(reader.value, 1);
				assert(reader.nextNode());
				assert.equal(reader.value, true);
				assert(reader.nextNode());
				assert.equal(reader.value, "test");
				assert.equal(reader.nextNode(), false);
			});

			it("multiple fields", () => {
				const schema = new InMemoryStoredSchemaRepository(
					intoStoredSchema(jsonDocumentSchema),
				);
				const forest = factory(schema);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const clone = forest.clone(schema, forest.anchors);
				const reader = clone.allocateCursor();
				moveToDetachedField(clone, reader);
				assert(reader.firstNode());
				const fromClone = cursorToJsonObject(reader);
				assert.deepEqual(nestedContent, fromClone);
			});

			it("with anchors", () => {
				const schema = new InMemoryStoredSchemaRepository(
					intoStoredSchema(jsonDocumentSchema),
				);
				const forest = factory(schema);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const forestReader = forest.allocateCursor();
				moveToDetachedField(forest, forestReader);
				assert(forestReader.firstNode());
				forestReader.enterField(xField);
				assert(forestReader.firstNode());
				const anchor = forestReader.buildAnchor();

				const clone = forest.clone(schema, forest.anchors);
				const reader = clone.allocateCursor();
				clone.tryMoveCursorToNode(anchor, reader);
				assert.equal(reader.value, undefined);
			});
		});

		it("editing a cloned forest does not modify the original", () => {
			const schema = new InMemoryStoredSchemaRepository(
				intoStoredSchema(jsonSequenceRootSchema),
			);
			const forest = factory(schema);
			const content: JsonableTree[] = [
				{ type: leaf.number.name, value: 1 },
				{ type: leaf.boolean.name, value: true },
				{ type: leaf.string.name, value: "test" },
			];
			initializeForest(forest, content.map(cursorForJsonableTreeNode));

			const clone = forest.clone(schema, forest.anchors);
			const mark: DeltaMark = { count: 1, detach: detachId };
			const delta: DeltaFieldMap = new Map([[rootFieldKey, { local: [mark] }]]);
			applyTestDelta(delta, clone);

			// Check the clone has the new value
			const cloneReader = clone.allocateCursor();
			moveToDetachedField(clone, cloneReader);
			assert(cloneReader.firstNode());
			assert.equal(cloneReader.value, true);

			// Check the original has the old value
			const originalReader = forest.allocateCursor();
			moveToDetachedField(forest, originalReader);
			assert(originalReader.firstNode());
			assert.equal(originalReader.value, 1);
		});

		describe("can apply deltas with", () => {
			if (!config.skipCursorErrorCheck) {
				it("ensures cursors are cleared before applying deltas", () => {
					const forest = factory(
						new InMemoryStoredSchemaRepository(
							intoStoredSchema(jsonSequenceRootSchema),
						),
					);
					initializeForest(forest, [singleJsonCursor(1)]);
					const cursor = forest.allocateCursor();
					moveToDetachedField(forest, cursor);

					const mark: DeltaMark = { count: 1, detach: detachId };
					const delta: DeltaFieldMap = new Map([[rootFieldKey, { local: [mark] }]]);
					assert.throws(() => applyTestDelta(delta, forest));
				});
			}

			it("set fields as remove and insert", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonSequenceRootSchema)),
				);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const setField: DeltaMark = {
					count: 1,
					fields: new Map([
						[
							xField,
							{
								build: [
									{
										id: buildId,
										trees: [
											cursorForJsonableTreeNode({
												type: leaf.boolean.name,
												value: true,
											}),
										],
									},
								],
								local: [
									{ count: 1, detach: detachId },
									{ count: 1, attach: buildId },
								],
							},
						],
					]),
				};
				const delta: DeltaFieldMap = new Map([[rootFieldKey, { local: [setField] }]]);
				applyTestDelta(delta, forest);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				reader.enterField(xField);
				assert.equal(reader.firstNode(), true);
				assert.equal(reader.value, true);
			});

			it("set fields as replace", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonSequenceRootSchema)),
				);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const setField: DeltaMark = {
					count: 1,
					fields: new Map([
						[
							xField,
							deltaForSet(
								cursorForJsonableTreeNode({
									type: leaf.boolean.name,
									value: true,
								}),
								buildId,
								detachId,
							),
						],
					]),
				};
				const delta: DeltaFieldMap = new Map([[rootFieldKey, { local: [setField] }]]);
				applyTestDelta(delta, forest);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				reader.enterField(xField);
				assert.equal(reader.firstNode(), true);
				assert.equal(reader.value, true);
			});

			it("remove", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
				);
				const content: JsonCompatible[] = [1, 2];
				initializeForest(forest, content.map(singleJsonCursor));

				const mark: DeltaMark = {
					count: 1,
					detach: detachId,
				};
				const delta: DeltaFieldMap = new Map([[rootFieldKey, { local: [mark] }]]);
				applyTestDelta(delta, forest);

				// Inspect resulting tree: should just have `2`.
				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				assert.equal(reader.value, 2);
				assert.equal(reader.nextNode(), false);
			});

			it("a skip", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
				);
				const content: JsonCompatible[] = [1, 2];
				initializeForest(forest, content.map(singleJsonCursor));
				const cursor = forest.allocateCursor();
				moveToDetachedField(forest, cursor);
				cursor.firstNode();
				const anchor = cursor.buildAnchor();
				cursor.clear();

				const skip: DeltaMark = { count: 1 };
				const mark: DeltaMark = {
					count: 1,
					detach: detachId,
				};
				const delta: DeltaFieldMap = new Map([[rootFieldKey, { local: [skip, mark] }]]);
				applyTestDelta(delta, forest);

				// Inspect resulting tree: should just have `1`.
				const reader = forest.allocateCursor();
				assert.equal(forest.tryMoveCursorToNode(anchor, reader), TreeNavigationResult.Ok);
				assert.equal(reader.value, 1);
				assert.equal(reader.nextNode(), false);
			});

			it("insert", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
				);
				const content: JsonCompatible[] = [1, 2];
				initializeForest(forest, content.map(singleJsonCursor));

				const delta: DeltaFieldMap = new Map([
					[rootFieldKey, deltaForSet(singleJsonCursor(3), buildId)],
				]);
				applyTestDelta(delta, forest);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				assert.equal(reader.value, 3);
				assert.equal(reader.nextNode(), true);
				assert.equal(reader.value, 1);
				assert.equal(reader.nextNode(), true);
				assert.equal(reader.value, 2);
				assert.equal(reader.nextNode(), false);
			});

			it("move-out under transient node", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonDocumentSchema)),
				);

				const moveId = { minor: 1 };
				const moveOut: DeltaMark = {
					count: 1,
					detach: moveId,
				};
				const moveIn: DeltaMark = {
					count: 1,
					attach: moveId,
				};
				const delta: DeltaFieldMap = new Map([
					[
						rootFieldKey,
						{
							build: [{ id: buildId, trees: [singleJsonCursor({ x: 0 })] }],
							global: [
								{
									id: buildId,
									fields: new Map([[xField, { local: [moveOut] }]]),
								},
							],
							local: [moveIn],
							relocate: [{ id: buildId, count: 1, destination: detachId }],
						},
					],
				]);
				applyTestDelta(delta, forest);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				assert.equal(reader.value, 0);
				assert.equal(reader.nextNode(), false);
			});

			it("move out and move in", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonSequenceRootSchema)),
				);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const moveId = { minor: 0 };
				const moveOut: DeltaMark = {
					count: 1,
					detach: moveId,
				};
				const moveIn: DeltaMark = {
					count: 1,
					attach: moveId,
				};
				const modify: DeltaMark = {
					count: 1,
					fields: new Map([
						[xField, { local: [moveOut] }],
						[yField, { local: [{ count: 1 }, moveIn] }],
					]),
				};
				const delta: DeltaFieldMap = new Map([[rootFieldKey, { local: [modify] }]]);
				applyTestDelta(delta, forest);
				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				reader.enterField(xField);
				assert.equal(reader.getFieldLength(), 0);
				reader.exitField();
				reader.enterField(yField);
				assert.equal(reader.getFieldLength(), 2);
			});

			it("insert and modify", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonSequenceRootSchema)),
				);
				const content: JsonCompatible[] = [1, 2];
				initializeForest(forest, content.map(singleJsonCursor));

				const delta: DeltaFieldMap = new Map([
					[
						rootFieldKey,
						{
							build: [
								{
									id: buildId,
									trees: [
										cursorForJsonableTreeNode({
											type: leaf.number.name,
											value: 3,
										}),
									],
								},
							],
							global: [
								{
									id: buildId,
									fields: new Map([
										[
											brand("newField"),
											{
												build: [
													{
														id: buildId2,
														trees: [
															cursorForJsonableTreeNode({
																type: leaf.number.name,
																value: 4,
															}),
														],
													},
												],
												local: [{ count: 1, attach: buildId2 }],
											},
										],
									]),
								},
							],
							local: [{ count: 1, attach: buildId }],
						},
					],
				]);
				applyTestDelta(delta, forest);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				assert.equal(reader.value, 3);
				reader.enterField(brand("newField"));
				assert(reader.firstNode());
				assert.equal(reader.value, 4);
				assert.equal(reader.nextNode(), false);
				reader.exitField();
				assert.equal(reader.nextNode(), true);
				assert.equal(reader.value, 1);
				assert.equal(reader.nextNode(), true);
				assert.equal(reader.value, 2);
				assert.equal(reader.nextNode(), false);
			});

			it("modify and remove", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonSequenceRootSchema)),
				);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const moveId = { minor: 0 };
				const mark: DeltaMark = {
					count: 1,
					detach: detachId,
					fields: new Map([[xField, { local: [{ count: 1, detach: moveId }] }]]),
				};
				const delta: DeltaFieldMap = new Map([
					[rootFieldKey, { local: [mark, { count: 1, attach: moveId }] }],
				]);
				applyTestDelta(delta, forest);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert.equal(reader.firstNode(), true);
				assert.equal(reader.value, undefined);
				assert.equal(reader.firstField(), true);
				assert.equal(reader.getFieldKey(), fooField);
			});

			it("modify and move out", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonSequenceRootSchema)),
				);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const moveId = { minor: 0 };
				const mark: DeltaMark = {
					count: 1,
					fields: new Map([
						[
							xField,
							{
								local: [
									{
										count: 1,
										detach: moveId,
										fields: new Map([
											[
												fooField,
												deltaForSet(singleJsonCursor(3), buildId, detachId),
											],
										]),
									},
								],
							},
						],
						[yField, { local: [{ count: 1, attach: moveId }] }],
					]),
				};
				const delta: DeltaFieldMap = new Map([[rootFieldKey, { local: [mark] }]]);
				applyTestDelta(delta, forest);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				reader.enterField(xField);
				assert.equal(reader.getFieldLength(), 0);
				reader.exitField();
				reader.enterField(yField);
				assert(reader.firstNode());
				reader.enterField(fooField);
				assert(reader.firstNode());
				assert.equal(reader.value, 3);
				reader.exitNode();
				reader.exitField();
				assert.equal(reader.nextNode(), true);
			});
		});

		describe("Does not leave an empty field", () => {
			it("when removing the last node in the field", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(jsonSequenceRootSchema)),
				);
				const delta: DeltaFieldMap = new Map([
					[
						rootFieldKey,
						{
							local: [
								{
									count: 1,
									fields: new Map([
										[
											xField,
											{
												local: [
													{
														count: 1,
														detach: detachId,
													},
												],
											},
										],
									]),
								},
							],
						},
					],
				]);
				const expected: JsonCompatible[] = [{ y: 1 }];
				initializeForest(forest, [singleJsonCursor(nestedContent)]);
				applyTestDelta(delta, forest);
				const readCursor = forest.allocateCursor();
				moveToDetachedField(forest, readCursor);
				const actual = mapCursorField(readCursor, cursorToJsonObject);
				readCursor.free();
				assert.deepEqual(actual, expected);
			});
			it("when moving the last node in the field", () => {
				const builder = new SchemaBuilder({ scope: "moving" });
				const root = builder.object("root", {
					x: SchemaBuilder.sequence(leaf.number),
					y: SchemaBuilder.sequence(leaf.number),
				});
				const schema = builder.intoSchema(builder.optional(root));

				const forest = factory(
					new InMemoryStoredSchemaRepository(intoStoredSchema(schema)),
				);
				initializeForest(forest, [
					cursorForTypedTreeData({ schema }, root, {
						x: [2],
						y: [1],
					}),
				]);
				const moveId = { minor: 0 };
				const moveOut: DeltaMark = {
					count: 1,
					detach: moveId,
				};
				const moveIn: DeltaMark = {
					count: 1,
					attach: moveId,
				};
				const modify: DeltaMark = {
					count: 1,
					fields: new Map([
						[xField, { local: [moveOut] }],
						[yField, { local: [{ count: 1 }, moveIn] }],
					]),
				};
				const delta: DeltaFieldMap = new Map([[rootFieldKey, { local: [modify] }]]);
				applyTestDelta(delta, forest);
				const expectedCursor = cursorForTypedTreeData({ schema }, root, {
					x: [],
					y: [1, 2],
				});
				const expected: JsonableTree[] = [jsonableTreeFromCursor(expectedCursor)];
				const readCursor = forest.allocateCursor();
				moveToDetachedField(forest, readCursor);
				const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
				readCursor.free();
				assert.deepEqual(actual, expected);
			});
		});
	});

	testGeneralPurposeTreeCursor(
		"forest cursor",
		(data): ITreeCursor => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(intoStoredSchema(testTreeSchema)),
			);
			initializeForest(forest, [cursorForJsonableTreeNode(data)]);
			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			assert(cursor.firstNode());
			return cursor;
		},
		jsonableTreeFromCursor,
		true,
	);
}
