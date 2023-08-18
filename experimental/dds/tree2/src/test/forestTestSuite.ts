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
	recordDependency,
	Delta,
	FieldKey,
	JsonableTree,
	mapCursorField,
	rootFieldKey,
	UpPath,
	clonePath,
	ITreeCursor,
	EmptyKey,
	ValueSchema,
	FieldUpPath,
} from "../core";
import {
	cursorToJsonObject,
	jsonNumber,
	jsonSchema,
	jsonRoot,
	singleJsonCursor,
	jsonBoolean,
	jsonString,
} from "../domains";
import { JsonCompatible, brand, brandOpaque } from "../util";
import {
	FieldKinds,
	jsonableTreeFromCursor,
	singleTextCursor,
	defaultSchemaPolicy,
	isNeverField,
	SchemaBuilder,
	cursorForTypedTreeData,
} from "../feature-libraries";
import { MockDependent, expectEqualFieldPaths } from "./utils";
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

const jsonDocumentSchema = new SchemaBuilder(
	"jsonDocumentSchema",
	{},
	jsonSchema,
).intoDocumentSchema(SchemaBuilder.fieldSequence(...jsonRoot));

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
					const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
					const forest = factory(schema);

					const rootFieldSchema = SchemaBuilder.field(FieldKinds.optional, ...jsonRoot);
					schema.update({
						...jsonSchema,
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
				new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
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

		it("moving a cursor to the root of an empty forest fails", () => {
			const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			assert.equal(cursor.firstNode(), false);
		});

		it("tryMoveCursorToNode", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonDocumentSchema),
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
				new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonDocumentSchema),
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

		it("anchors creation and use", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonDocumentSchema),
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
				new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonDocumentSchema),
			);

			initializeForest(forest, [singleJsonCursor([1, 2])]);

			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			assert(cursor.firstNode());
			cursor.enterField(EmptyKey);
			cursor.enterNode(0);
			const firstNodeAnchor = cursor.buildAnchor();
			cursor.clear();

			const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
			const delta: Delta.Root = new Map([[rootFieldKey, [mark]]]);
			forest.applyDelta(delta);
			forest.anchors.applyDelta(delta);

			assert.equal(
				forest.tryMoveCursorToNode(firstNodeAnchor, cursor),
				TreeNavigationResult.NotFound,
			);
		});

		describe("can clone", () => {
			it("an empty forest", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				const clone = forest.clone(forest.schema, forest.anchors);
				const reader = clone.allocateCursor();
				moveToDetachedField(clone, reader);
				// Expect no nodes under the detached field
				assert.equal(reader.firstNode(), false);
			});

			it("primitive nodes", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonDocumentSchema),
				);
				const content: JsonCompatible[] = [1, true, "test"];
				initializeForest(forest, content.map(singleJsonCursor));

				const clone = forest.clone(forest.schema, forest.anchors);
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
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonDocumentSchema),
				);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const clone = forest.clone(forest.schema, forest.anchors);
				const reader = clone.allocateCursor();
				moveToDetachedField(clone, reader);
				assert(reader.firstNode());
				const fromClone = cursorToJsonObject(reader);
				assert.deepEqual(nestedContent, fromClone);
			});

			it("with anchors", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
				);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const forestReader = forest.allocateCursor();
				moveToDetachedField(forest, forestReader);
				assert(forestReader.firstNode());
				forestReader.enterField(xField);
				assert(forestReader.firstNode());
				const anchor = forestReader.buildAnchor();

				const clone = forest.clone(forest.schema, forest.anchors);
				const reader = clone.allocateCursor();
				clone.tryMoveCursorToNode(anchor, reader);
				assert.equal(reader.value, undefined);
			});
		});

		it("editing a cloned forest does not modify the original", () => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
			);
			const content: JsonableTree[] = [
				{ type: jsonNumber.name, value: 1 },
				{ type: jsonBoolean.name, value: true },
				{ type: jsonString.name, value: "test" },
			];
			initializeForest(forest, content.map(singleTextCursor));

			const clone = forest.clone(forest.schema, forest.anchors);
			const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
			const delta: Delta.Root = new Map([[rootFieldKey, [mark]]]);
			clone.applyDelta(delta);

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
						new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
					);
					initializeForest(forest, [singleJsonCursor(1)]);
					const cursor = forest.allocateCursor();
					moveToDetachedField(forest, cursor);

					const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
					const delta: Delta.Root = new Map([[rootFieldKey, [mark]]]);
					assert.throws(() => forest.applyDelta(delta));
				});
			}

			it("set fields", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
				);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const setField: Delta.Modify = {
					type: Delta.MarkType.Modify,
					fields: new Map([
						[
							xField,
							[
								{ type: Delta.MarkType.Delete, count: 1 },
								{
									type: Delta.MarkType.Insert,
									content: [
										singleTextCursor({
											type: jsonBoolean.name,
											value: true,
										}),
									],
								},
							],
						],
					]),
				};
				const delta: Delta.Root = new Map([[rootFieldKey, [setField]]]);
				forest.applyDelta(delta);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				reader.enterField(xField);
				assert.equal(reader.firstNode(), true);
				assert.equal(reader.value, true);
			});

			it("delete", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonDocumentSchema),
				);
				const content: JsonCompatible[] = [1, 2];
				initializeForest(forest, content.map(singleJsonCursor));

				const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
				const delta: Delta.Root = new Map([[rootFieldKey, [0, mark]]]);
				forest.applyDelta(delta);

				// Inspect resulting tree: should just have `2`.
				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				assert.equal(reader.value, 2);
				assert.equal(reader.nextNode(), false);
			});

			it("a skip", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonDocumentSchema),
				);
				const content: JsonCompatible[] = [1, 2];
				initializeForest(forest, content.map(singleJsonCursor));
				const cursor = forest.allocateCursor();
				moveToDetachedField(forest, cursor);
				cursor.firstNode();
				const anchor = cursor.buildAnchor();
				cursor.clear();

				const skip: Delta.Skip = 1;
				const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
				const delta: Delta.Root = new Map([[rootFieldKey, [skip, mark]]]);
				forest.applyDelta(delta);

				// Inspect resulting tree: should just have `1`.
				const reader = forest.allocateCursor();
				assert.equal(forest.tryMoveCursorToNode(anchor, reader), TreeNavigationResult.Ok);
				assert.equal(reader.value, 1);
				assert.equal(reader.nextNode(), false);
			});

			it("insert", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonDocumentSchema),
				);
				const content: JsonCompatible[] = [1, 2];
				initializeForest(forest, content.map(singleJsonCursor));

				const mark: Delta.Insert = {
					type: Delta.MarkType.Insert,
					content: [singleJsonCursor(3)],
				};
				const delta: Delta.Root = new Map([[rootFieldKey, [mark]]]);
				forest.applyDelta(delta);

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
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonDocumentSchema),
				);

				const moveId: Delta.MoveId = brand(1);
				const moveOut: Delta.MoveOut = {
					type: Delta.MarkType.MoveOut,
					count: 1,
					moveId,
				};

				const moveIn: Delta.MoveIn = {
					type: Delta.MarkType.MoveIn,
					count: 1,
					moveId,
				};
				const mark: Delta.Insert = {
					type: Delta.MarkType.Insert,
					content: [singleJsonCursor({ x: 0 })],
					isTransient: true,
					fields: new Map([[xField, [moveOut]]]),
				};
				const delta: Delta.Root = new Map([[rootFieldKey, [mark, moveIn]]]);
				forest.applyDelta(delta);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				assert.equal(reader.value, 0);
				assert.equal(reader.nextNode(), false);
			});

			it("move out and move in", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
				);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const moveId = brandOpaque<Delta.MoveId>(0);
				const moveOut: Delta.MoveOut = {
					type: Delta.MarkType.MoveOut,
					count: 1,
					moveId,
				};
				const moveIn: Delta.MoveIn = {
					type: Delta.MarkType.MoveIn,
					count: 1,
					moveId,
				};
				const modify: Delta.Modify = {
					type: Delta.MarkType.Modify,
					fields: new Map([
						[xField, [moveOut]],
						[yField, [1, moveIn]],
					]),
				};
				const delta: Delta.Root = new Map([[rootFieldKey, [modify]]]);
				forest.applyDelta(delta);
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
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
				);
				const content: JsonCompatible[] = [1, 2];
				initializeForest(forest, content.map(singleJsonCursor));

				const mark: Delta.Insert = {
					type: Delta.MarkType.Insert,
					content: [singleTextCursor({ type: jsonNumber.name, value: 3 })],
					fields: new Map([
						[
							brand("newField"),
							[
								{
									type: Delta.MarkType.Insert,
									content: [{ type: jsonNumber.name, value: 4 }].map(
										singleTextCursor,
									),
								},
							],
						],
					]),
				};
				const delta: Delta.Root = new Map([[rootFieldKey, [mark]]]);
				forest.applyDelta(delta);

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

			it("modify and delete", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
				);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const moveId = brandOpaque<Delta.MoveId>(0);
				const mark: Delta.Delete = {
					type: Delta.MarkType.Delete,
					count: 1,
					fields: new Map([
						[xField, [{ type: Delta.MarkType.MoveOut, count: 1, moveId }]],
					]),
				};
				const delta: Delta.Root = new Map([
					[rootFieldKey, [mark, { type: Delta.MarkType.MoveIn, count: 1, moveId }]],
				]);
				forest.applyDelta(delta);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert.equal(reader.firstNode(), true);
				assert.equal(reader.value, undefined);
				assert.equal(reader.firstField(), true);
				assert.equal(reader.getFieldKey(), fooField);
			});

			it("modify and move out", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
				);
				initializeForest(forest, [singleJsonCursor(nestedContent)]);

				const moveId = brandOpaque<Delta.MoveId>(0);
				const mark: Delta.Modify = {
					type: Delta.MarkType.Modify,
					fields: new Map([
						[
							xField,
							[
								{
									type: Delta.MarkType.MoveOut,
									count: 1,
									moveId,
									fields: new Map([
										[
											fooField,
											[
												{ type: Delta.MarkType.Delete, count: 1 },
												{
													type: Delta.MarkType.Insert,
													content: [singleJsonCursor(2)],
												},
											],
										],
									]),
								},
							],
						],
						[yField, [{ type: Delta.MarkType.MoveIn, count: 1, moveId }]],
					]),
				};
				const delta: Delta.Root = new Map([[rootFieldKey, [mark]]]);
				forest.applyDelta(delta);

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
				assert.equal(reader.value, 2);
				reader.exitNode();
				reader.exitField();
				assert.equal(reader.nextNode(), true);
			});
		});

		describe("top level invalidation", () => {
			it("data editing", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
				);
				const dependent = new MockDependent("dependent");
				recordDependency(dependent, forest);

				const insert: Delta.Insert = {
					type: Delta.MarkType.Insert,
					content: [singleJsonCursor(1)],
				};
				const delta: Delta.Root = new Map([[rootFieldKey, [insert]]]);

				assert.deepEqual(dependent.tokens, []);
				forest.applyDelta(delta);
				assert.deepEqual(dependent.tokens.length, 1);

				forest.applyDelta(delta);
				assert.deepEqual(dependent.tokens.length, 2);

				// Remove the dependency so the dependent stops getting invalidation messages
				forest.removeDependent(dependent);
				forest.applyDelta(delta);
				assert.deepEqual(dependent.tokens.length, 2);
			});

			it("schema editing", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
				);
				const dependent = new MockDependent("dependent");
				recordDependency(dependent, forest);
				forest.schema.update(jsonSchema);

				assert.deepEqual(dependent.tokens.length, 1);
			});
		});

		describe("Does not leave an empty field", () => {
			it("when deleting the last node in the field", () => {
				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchema),
				);
				const delta: Delta.Root = new Map([
					[
						rootFieldKey,
						[
							{
								type: Delta.MarkType.Modify,
								fields: new Map([
									[
										xField,
										[
											{
												type: Delta.MarkType.Delete,
												count: 1,
											},
										],
									],
								]),
							},
						],
					],
				]);
				const expected: JsonCompatible[] = [{ y: 1 }];
				initializeForest(forest, [singleJsonCursor(nestedContent)]);
				forest.applyDelta(delta);
				const readCursor = forest.allocateCursor();
				moveToDetachedField(forest, readCursor);
				const actual = mapCursorField(readCursor, cursorToJsonObject);
				readCursor.free();
				assert.deepEqual(actual, expected);
			});
			it("when moving the last node in the field", () => {
				const builder = new SchemaBuilder("moving");
				const leaf = builder.leaf("leaf", ValueSchema.Number);
				const root = builder.struct("root", {
					x: SchemaBuilder.fieldSequence(leaf),
					y: SchemaBuilder.fieldSequence(leaf),
				});
				const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(root));

				const forest = factory(
					new InMemoryStoredSchemaRepository(defaultSchemaPolicy, schema),
				);
				initializeForest(forest, [
					cursorForTypedTreeData({ schema }, root, {
						x: [2],
						y: [1],
					}),
				]);
				const moveId = brandOpaque<Delta.MoveId>(0);
				const moveOut: Delta.MoveOut = {
					type: Delta.MarkType.MoveOut,
					count: 1,
					moveId,
				};
				const moveIn: Delta.MoveIn = {
					type: Delta.MarkType.MoveIn,
					count: 1,
					moveId,
				};
				const modify: Delta.Modify = {
					type: Delta.MarkType.Modify,
					fields: new Map([
						[xField, [moveOut]],
						[yField, [1, moveIn]],
					]),
				};
				const delta: Delta.Root = new Map([[rootFieldKey, [modify]]]);
				forest.applyDelta(delta);
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
				new InMemoryStoredSchemaRepository(defaultSchemaPolicy, testTreeSchema),
			);
			initializeForest(forest, [singleTextCursor(data)]);
			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			assert(cursor.firstNode());
			return cursor;
		},
		jsonableTreeFromCursor,
		true,
	);
}
