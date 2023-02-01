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
	fieldSchema,
	InMemoryStoredSchemaRepository,
	StoredSchemaRepository,
	recordDependency,
	Delta,
	FieldKey,
	JsonableTree,
	mapCursorField,
	rootFieldKey,
	rootFieldKeySymbol,
	UpPath,
	clonePath,
	ITreeCursor,
} from "../core";
import {
	cursorToJsonObject,
	jsonNumber,
	jsonObject,
	jsonSchemaData,
	jsonRoot,
	singleJsonCursor,
	jsonBoolean,
	jsonString,
} from "../domains";
import { brand, brandOpaque } from "../util";
import {
	FieldKinds,
	jsonableTreeFromCursor,
	singleTextCursor,
	defaultSchemaPolicy,
	isNeverField,
} from "../feature-libraries";
import { MockDependent } from "./utils";
import { testGeneralPurposeTreeCursor } from "./cursorTestSuite";

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

/**
 * Generic forest test suite
 */
export function testForest(config: ForestTestConfiguration): void {
	const factory = config.factory;
	describe(config.suiteName, () => {
		const nestedContent: JsonableTree[] = [
			{
				type: jsonObject.name,
				fields: {
					x: [
						{
							type: jsonNumber.name,
							value: 0,
						},
					],
					y: [
						{
							type: jsonNumber.name,
							value: 1,
						},
					],
				},
			},
		];

		const xField = brand<FieldKey>("x");
		const yField = brand<FieldKey>("y");

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

					const rootFieldSchema = fieldSchema(FieldKinds.optional, jsonRoot.types);
					schema.update({
						...jsonSchemaData,
						globalFieldSchema: new Map([[rootFieldKey, rootFieldSchema]]),
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
			const content: JsonableTree = {
				type: jsonObject.name,
				fields: {
					data: [
						{ type: jsonNumber.name, value: 1 },
						{ type: jsonNumber.name, value: 2 },
					],
				},
			};
			const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
			initializeForest(forest, [singleTextCursor(content)]);

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
			reader.enterField(brand("data"));
			reader.enterNode(1);
			assert.equal(reader.value, 2);
			// Move reader two down to the same place, but by a different route.
			reader2.enterField(brand("data"));
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
			const dependent = new MockDependent("dependent");
			recordDependency(dependent, forest);
			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			assert.equal(cursor.firstNode(), false);
		});

		it("anchors creation and use", () => {
			const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
			const dependent = new MockDependent("dependent");
			recordDependency(dependent, forest);

			const content: JsonableTree[] = [
				{
					type: jsonObject.name,
					fields: {
						data: [
							{ type: jsonNumber.name, value: 1 },
							{ type: jsonNumber.name, value: 2 },
						],
					},
				},
			];
			initializeForest(forest, content.map(singleTextCursor));

			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			assert(cursor.firstNode());
			const parentAnchor = cursor.buildAnchor();
			cursor.enterField(brand("data"));
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
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			assert.deepStrictEqual(parentPath, expectedParent);
			assert.deepStrictEqual(parentPath2, expectedParent);

			const expectedChild1: UpPath = {
				parent: expectedParent,
				parentField: brand("data"),
				parentIndex: 0,
			};

			const expectedChild2: UpPath = {
				parent: expectedParent,
				parentField: brand("data"),
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
			const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
			const dependent = new MockDependent("dependent");
			recordDependency(dependent, forest);

			const content: JsonableTree[] = [
				{
					type: jsonObject.name,
					fields: {
						data: [
							{ type: jsonNumber.name, value: 1 },
							{ type: jsonNumber.name, value: 2 },
						],
					},
				},
			];
			initializeForest(forest, content.map(singleTextCursor));

			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			assert(cursor.firstNode());
			cursor.enterField(brand("data"));
			cursor.enterNode(0);
			const firstNodeAnchor = cursor.buildAnchor();
			cursor.clear();

			const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
			const delta: Delta.Root = new Map([[rootFieldKeySymbol, { shallow: [mark] }]]);
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
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				const content: JsonableTree[] = [
					{ type: jsonNumber.name, value: 1 },
					{ type: jsonBoolean.name, value: true },
					{ type: jsonString.name, value: "test" },
				];
				initializeForest(forest, content.map(singleTextCursor));

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
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				initializeForest(forest, nestedContent.map(singleTextCursor));

				const clone = forest.clone(forest.schema, forest.anchors);
				const reader = clone.allocateCursor();
				moveToDetachedField(clone, reader);
				assert(reader.firstNode());
				reader.enterField(xField);
				assert(reader.firstNode());
				assert.equal(reader.value, 0);
				assert.equal(reader.nextNode(), false);
				reader.exitField();
				reader.enterField(yField);
				assert(reader.firstNode());
				assert.equal(reader.value, 1);
				assert.equal(reader.nextNode(), false);
			});

			it("with anchors", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				initializeForest(forest, nestedContent.map(singleTextCursor));

				const forestReader = forest.allocateCursor();
				moveToDetachedField(forest, forestReader);
				assert(forestReader.firstNode());
				forestReader.enterField(xField);
				assert(forestReader.firstNode());
				const anchor = forestReader.buildAnchor();

				const clone = forest.clone(forest.schema, forest.anchors);
				const reader = clone.allocateCursor();
				clone.tryMoveCursorToNode(anchor, reader);
				assert.equal(reader.value, 0);
			});
		});

		it("editing a cloned forest does not modify the original", () => {
			const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
			const content: JsonableTree[] = [
				{ type: jsonNumber.name, value: 1 },
				{ type: jsonBoolean.name, value: true },
				{ type: jsonString.name, value: "test" },
			];
			initializeForest(forest, content.map(singleTextCursor));

			const clone = forest.clone(forest.schema, forest.anchors);
			const delta: Delta.Root = new Map([
				[rootFieldKeySymbol, { beforeShallow: [{ index: 0, setValue: 2 }] }],
			]);
			clone.applyDelta(delta);

			// Check the clone has the new value
			const cloneReader = clone.allocateCursor();
			moveToDetachedField(clone, cloneReader);
			assert(cloneReader.firstNode());
			assert.equal(cloneReader.value, 2);

			// Check the original has the old value
			const originalReader = forest.allocateCursor();
			moveToDetachedField(forest, originalReader);
			assert(originalReader.firstNode());
			assert.equal(originalReader.value, 1);
		});

		describe("can apply deltas with", () => {
			if (!config.skipCursorErrorCheck) {
				it("ensures cursors are cleared before applying deltas", () => {
					const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
					const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }];
					initializeForest(forest, content.map(singleTextCursor));
					const cursor = forest.allocateCursor();
					moveToDetachedField(forest, cursor);

					const delta: Delta.Root = new Map([
						[rootFieldKeySymbol, { beforeShallow: [{ index: 0, setValue: 2 }] }],
					]);
					assert.throws(() => forest.applyDelta(delta));
				});
			}

			it("set value", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				const content: JsonableTree = { type: jsonNumber.name, value: 1 };
				initializeForest(forest, [singleTextCursor(content)]);

				const delta: Delta.Root = new Map([
					[rootFieldKeySymbol, { beforeShallow: [{ index: 0, setValue: 2 }] }],
				]);
				forest.applyDelta(delta);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());

				assert.equal(reader.value, 2);
			});

			it("clear value", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				const content: JsonableTree = { type: jsonNumber.name, value: 1 };
				initializeForest(forest, [singleTextCursor(content)]);

				const delta: Delta.Root = new Map([
					[rootFieldKeySymbol, { beforeShallow: [{ index: 0, setValue: undefined }] }],
				]);
				forest.applyDelta(delta);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				assert.equal(reader.value, undefined);
			});

			it("set fields", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				initializeForest(forest, nestedContent.map(singleTextCursor));

				const setField: Delta.NodeChanges = {
					fields: new Map([
						[
							xField,
							{
								shallow: [
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
							},
						],
					]),
				};
				const delta: Delta.Root = new Map([
					[rootFieldKeySymbol, { beforeShallow: [{ index: 0, ...setField }] }],
				]);
				forest.applyDelta(delta);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				reader.enterField(xField);
				assert.equal(reader.firstNode(), true);
				assert.equal(reader.value, true);
			});

			it("delete", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				const content: JsonableTree[] = [
					{ type: jsonNumber.name, value: 1 },
					{ type: jsonNumber.name, value: 2 },
				];
				initializeForest(forest, content.map(singleTextCursor));

				const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
				const delta: Delta.Root = new Map([[rootFieldKeySymbol, { shallow: [mark] }]]);
				forest.applyDelta(delta);

				// Inspect resulting tree: should just have `2`.
				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				assert.equal(reader.value, 2);
				assert.equal(reader.nextNode(), false);
			});

			it("a skip", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				const content: JsonableTree[] = [
					{ type: jsonNumber.name, value: 1 },
					{ type: jsonNumber.name, value: 2 },
				];
				initializeForest(forest, content.map(singleTextCursor));
				const cursor = forest.allocateCursor();
				moveToDetachedField(forest, cursor);
				cursor.firstNode();
				const anchor = cursor.buildAnchor();
				cursor.clear();

				const skip: Delta.Skip = 1;
				const mark: Delta.Delete = { type: Delta.MarkType.Delete, count: 1 };
				const delta: Delta.Root = new Map([
					[rootFieldKeySymbol, { shallow: [skip, mark] }],
				]);
				forest.applyDelta(delta);

				// Inspect resulting tree: should just have `1`.
				const reader = forest.allocateCursor();
				assert.equal(forest.tryMoveCursorToNode(anchor, reader), TreeNavigationResult.Ok);
				assert.equal(reader.value, 1);
				assert.equal(reader.nextNode(), false);
			});

			it("insert", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				const content: JsonableTree[] = [
					{ type: jsonNumber.name, value: 1 },
					{ type: jsonNumber.name, value: 2 },
				];
				initializeForest(forest, content.map(singleTextCursor));

				const mark: Delta.Insert = {
					type: Delta.MarkType.Insert,
					content: [singleTextCursor({ type: jsonNumber.name, value: 3 })],
				};
				const delta: Delta.Root = new Map([[rootFieldKeySymbol, { shallow: [mark] }]]);
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

			it("move out and move in", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				initializeForest(forest, nestedContent.map(singleTextCursor));

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
				const modify: Delta.NodeChanges = {
					fields: new Map([
						[xField, { shallow: [moveOut] }],
						[yField, { shallow: [1, moveIn] }],
					]),
				};
				const delta: Delta.Root = new Map([
					[rootFieldKeySymbol, { beforeShallow: [{ index: 0, ...modify }] }],
				]);
				forest.applyDelta(delta);
				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				reader.enterField(xField);
				assert.equal(reader.getFieldLength(), 0);
				reader.exitField();
				reader.enterField(yField);
				assert.equal(reader.getFieldLength(), 2);
				assert(reader.firstNode());
				assert.equal(reader.value, 1);
				assert(reader.nextNode());
				assert.equal(reader.value, 0);
			});

			it("insert and modify", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				const content: JsonableTree[] = [
					{ type: jsonNumber.name, value: 1 },
					{ type: jsonNumber.name, value: 2 },
				];
				initializeForest(forest, content.map(singleTextCursor));

				const mark: Delta.Insert = {
					type: Delta.MarkType.Insert,
					content: [singleTextCursor({ type: jsonNumber.name, value: 3 })],
				};
				const modify: Delta.NodeChanges = {
					fields: new Map([
						[
							brand("newField"),
							{
								shallow: [
									{
										type: Delta.MarkType.Insert,
										content: [{ type: jsonNumber.name, value: 4 }].map(
											singleTextCursor,
										),
									},
								],
							},
						],
					]),
				};
				const delta: Delta.Root = new Map([
					[
						rootFieldKeySymbol,
						{
							shallow: [mark],
							afterShallow: [{ index: 0, ...modify }],
						},
					],
				]);
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
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				initializeForest(forest, nestedContent.map(singleTextCursor));

				const moveId = brandOpaque<Delta.MoveId>(0);
				const modify: Delta.NodeChanges = {
					fields: new Map([
						[
							xField,
							{
								shallow: [{ type: Delta.MarkType.MoveOut, count: 1, moveId }],
							},
						],
					]),
				};
				const delta: Delta.Root = new Map([
					[
						rootFieldKeySymbol,
						{
							shallow: [
								{ type: Delta.MarkType.Delete, count: 1 },
								{ type: Delta.MarkType.MoveIn, count: 1, moveId },
							],
							beforeShallow: [{ index: 0, ...modify }],
						},
					],
				]);
				forest.applyDelta(delta);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert.equal(reader.firstNode(), true);
				assert.equal(reader.value, 0);
				assert.equal(reader.firstField(), false);
			});

			it("modify and move out", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				initializeForest(forest, nestedContent.map(singleTextCursor));

				const moveId = brandOpaque<Delta.MoveId>(0);
				const modify: Delta.NodeChanges = {
					fields: new Map([
						[
							xField,
							{
								beforeShallow: [{ index: 0, setValue: 2 }],
								shallow: [
									{
										type: Delta.MarkType.MoveOut,
										count: 1,
										moveId,
									},
								],
							},
						],
						[
							yField,
							{
								shallow: [{ type: Delta.MarkType.MoveIn, count: 1, moveId }],
							},
						],
					]),
				};
				const delta: Delta.Root = new Map([
					[
						rootFieldKeySymbol,
						{
							beforeShallow: [{ index: 0, ...modify }],
						},
					],
				]);
				forest.applyDelta(delta);

				const reader = forest.allocateCursor();
				moveToDetachedField(forest, reader);
				assert(reader.firstNode());
				reader.enterField(xField);
				assert.equal(reader.getFieldLength(), 0);
				reader.exitField();
				reader.enterField(yField);
				assert(reader.firstNode());
				assert.equal(reader.value, 2);
				assert.equal(reader.nextNode(), true);
			});
		});

		describe("top level invalidation", () => {
			it("data editing", () => {
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				const dependent = new MockDependent("dependent");
				recordDependency(dependent, forest);

				const content: JsonableTree[] = [{ type: jsonNumber.name, value: 1 }];
				const insert: Delta.Insert = {
					type: Delta.MarkType.Insert,
					content: content.map(singleTextCursor),
				};
				const delta: Delta.Root = new Map([[rootFieldKeySymbol, { shallow: [insert] }]]);

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
				const forest = factory(new InMemoryStoredSchemaRepository(defaultSchemaPolicy));
				const dependent = new MockDependent("dependent");
				recordDependency(dependent, forest);
				forest.schema.update(jsonSchemaData);

				assert.deepEqual(dependent.tokens.length, 1);
			});
		});
	});

	testGeneralPurposeTreeCursor(
		"forest cursor",
		(data): ITreeCursor => {
			const forest = factory(
				new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData),
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
