/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	validateAssertionError,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import {
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaMark,
	type DeltaVisitor,
	type DetachedField,
	EmptyKey,
	type FieldKey,
	type FieldUpPath,
	type ForestRootId,
	type IEditableForest,
	type ITreeCursor,
	type JsonableTree,
	TreeNavigationResult,
	TreeStoredSchemaRepository,
	type TreeStoredSchemaSubscription,
	type UpPath,
	clonePath,
	createAnnouncedVisitor,
	detachedFieldAsKey,
	makeDetachedFieldIndex,
	mapCursorField,
	moveToDetachedField,
	rootFieldKey,
} from "../core/index.js";
import {
	cursorForJsonableTreeField,
	jsonableTreeFromCursor,
} from "../feature-libraries/index.js";
import { JsonAsTree } from "../jsonDomainSchema.js";
import {
	booleanSchema,
	numberSchema,
	SchemaFactory,
	stringSchema,
	toInitialSchema,
} from "../simple-tree/index.js";
import { type JsonCompatible, brand } from "../util/index.js";

import { testGeneralPurposeTreeCursor, testTreeSchema } from "./cursorTestSuite.js";
import { initializeForest } from "./feature-libraries/index.js";
import { cursorToJsonObject, fieldJsonCursor, singleJsonCursor } from "./json/index.js";
import { jsonSequenceRootSchema } from "./sequenceRootUtils.js";
import {
	applyTestDelta,
	chunkFromJsonableTrees,
	chunkFromJsonTrees,
	expectEqualFieldPaths,
	expectEqualPaths,
} from "./utils.js";

/**
 * Configuration for the forest test suite.
 */
export interface ForestTestConfiguration {
	factory: (schema: TreeStoredSchemaSubscription) => IEditableForest;

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

const buildId = { minor: 42 };
const buildId2 = { minor: 442 };
const detachId = { minor: 43 };

const optionalArraySchema = toInitialSchema(SchemaFactory.optional(JsonAsTree.Array));

/**
 * Generic forest test suite
 */
export function testForest(config: ForestTestConfiguration): void {
	const factory = config.factory;

	const nestedContent: JsonCompatible = {
		x: { foo: 2 },
		y: 1,
	};
	const xField = brand<FieldKey>("x");
	const yField = brand<FieldKey>("y");
	const fooField: FieldKey = brand("foo");

	// Use Json Cursor to insert and extract some Json data
	describe("insert and extract json", () => {
		const testCases: [string, {} | number][] = [
			["primitive", 5],
			["array", [1, 2, 3]],
			["object", { blah: "test" }],
			["nested objects", { blah: { foo: 5 }, baz: [{}, { foo: 3 }] }],
		];
		for (const [name, data] of testCases) {
			it(name, () => {
				const schemaFactory = new SchemaFactory("forest test suite");

				const rootSchema = schemaFactory.optional([JsonAsTree.Array]);
				const schema = new TreeStoredSchemaRepository(toInitialSchema(rootSchema));

				const forest = factory(schema);

				initializeForest(forest, fieldJsonCursor([data]));

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
		const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));
		initializeForest(forest, fieldJsonCursor([[1, 2]]));

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
		const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));
		assert(forest.isEmpty);
		initializeForest(forest, fieldJsonCursor([[]]));
		assert(!forest.isEmpty);
	});

	it("isEmpty: other root", () => {
		const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));
		assert(forest.isEmpty);

		const insert: DeltaFieldChanges = { marks: [{ count: 1, attach: { minor: 1 } }] };
		applyTestDelta(new Map([[brand("different root"), insert]]), forest, {
			build: [{ id: { minor: 1 }, trees: chunkFromJsonTrees([[]]) }],
		});
		assert(!forest.isEmpty);
	});

	it("moving a cursor to the root of an empty forest fails", () => {
		const forest = factory(new TreeStoredSchemaRepository());
		const cursor = forest.allocateCursor();
		moveToDetachedField(forest, cursor);
		assert.equal(cursor.firstNode(), false);
	});

	it("tryMoveCursorToNode", () => {
		const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));

		initializeForest(forest, fieldJsonCursor([[1, 2]]));

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
		const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));

		initializeForest(forest, fieldJsonCursor([[1, 2]]));

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
			const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));
			initializeForest(forest, fieldJsonCursor([[1, 2]]));

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
		const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));
		initializeForest(forest, fieldJsonCursor([[1, 2]]));

		const forestCursor = forest.allocateCursor();
		moveToDetachedField(forest, forestCursor);
		const expected = mapCursorField(forestCursor, jsonableTreeFromCursor);

		const cursor = forest.getCursorAboveDetachedFields();
		cursor.enterField(rootFieldKey);
		const actual = mapCursorField(cursor, jsonableTreeFromCursor);
		assert.deepEqual(actual, expected);
	});

	it("anchors creation and use", () => {
		const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));
		initializeForest(forest, fieldJsonCursor([[1, 2]]));

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

	it("tryMoveCursorToNode with anchor to deleted node returns NotFound", () => {
		const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));

		initializeForest(forest, fieldJsonCursor([[1, 2]]));

		const cursor = forest.allocateCursor();
		moveToDetachedField(forest, cursor);
		assert(cursor.firstNode());
		cursor.enterField(EmptyKey);
		cursor.enterNode(0);
		const firstNodeAnchor = cursor.buildAnchor();
		cursor.clear();

		const mark: DeltaMark = { count: 1, detach: detachId };
		const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [mark] }]]);
		applyTestDelta(delta, forest, { destroy: [{ id: detachId, count: 1 }] });
		applyTestDelta(delta, forest.anchors, { destroy: [{ id: detachId, count: 1 }] });

		assert.equal(
			forest.tryMoveCursorToNode(firstNodeAnchor, cursor),
			TreeNavigationResult.NotFound,
		);
	});

	it("can destroy detached fields", () => {
		const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));
		const content: JsonCompatible[] = [1, 2];
		initializeForest(forest, fieldJsonCursor(content));

		const mark: DeltaMark = {
			count: 1,
			detach: detachId,
		};
		const detachedFieldIndex = makeDetachedFieldIndex();
		const delta: DeltaFieldMap = new Map<FieldKey, DeltaFieldChanges>([
			[rootFieldKey, { marks: [mark] }],
		]);
		applyTestDelta(delta, forest, { detachedFieldIndex });

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

	/**
	 * This suite checks that forests assert on invalid deltas.
	 *
	 * Generally asserts like this are not part of the contract we would expect from an interface implementation,
	 * but malformed deltas and corrupted forests are difficult to triage and have a high risk for persisted data corruption,
	 * so we make an exception and ensure the validation is consistent.
	 *
	 * Among other things this ensures that when swapping forest implementations to try and see if the issue is a bug in the forest,
	 * we don't get confusing signals due to missing validation.
	 */
	describe("rejects invalid deltas", () => {
		const detachedField: DetachedField = brand("invalidDeltaSource");
		const detachedKey = detachedFieldAsKey(detachedField);

		function setupForest(): IEditableForest {
			const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
			initializeForest(forest, fieldJsonCursor([0, 1, 2, 3, 4]));
			return forest;
		}

		function afterAssert(forest: IEditableForest, visitor: DeltaVisitor): void {
			// Ensure the forest has been put into a broken state due to the edit which failed during application.
			// This helps ensure that once a forest is in an invalid state, and likely out of sync with what is required/assumed,
			// it can't be read, preventing further corruption.
			// This is part of a defense in depth approach:
			// it only matters if there is a bug that resulted in a invalid delta,
			// and the higher level logic applying the delta to the forest
			// should also handle application failure and track its own broken state as needed.
			assert.throws(
				() => forest.isEmpty,
				validateUsageError(/invalid state by another error/),
			);
			assert.throws(
				() => visitor.free(),
				validateUsageError(/invalid state by another error/),
			);
		}

		it("rejects destroying a missing detached field", () => {
			const forest = setupForest();
			const visitor = forest.acquireVisitor();

			assert.throws(
				() => visitor.destroy(detachedKey, 0),
				validateAssertionError("Destroyed field must exist"),
			);
			afterAssert(forest, visitor);
		});

		it("rejects creating an occupied detached field", () => {
			const forest = setupForest();
			const visitor = forest.acquireVisitor();

			assert.throws(
				() => visitor.create([singleJsonCursor(99)], rootFieldKey),
				validateAssertionError("Create destination must be a new empty field"),
			);
			afterAssert(forest, visitor);
		});

		it("rejects attaching from a missing detached field", () => {
			const forest = setupForest();
			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);

			assert.throws(
				() => visitor.attach(detachedKey, 1, 0),
				validateAssertionError("Attach source field must exist"),
			);
			afterAssert(forest, visitor);
		});

		it("rejects attaching with a mismatched count", () => {
			const forest = setupForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor(98), singleJsonCursor(99)], detachedKey);
			visitor.enterField(rootFieldKey);

			assert.throws(
				() => visitor.attach(detachedKey, 1, 0),
				validateAssertionError("Attach must consume all nodes in source field"),
			);
			afterAssert(forest, visitor);
		});

		it("rejects attaching beyond the destination field", () => {
			const forest = setupForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor(99)], detachedKey);
			visitor.enterField(rootFieldKey);

			assert.throws(
				() => visitor.attach(detachedKey, 1, 6),
				validateAssertionError("Attach destination must not exceed field length"),
			);
			afterAssert(forest, visitor);
		});

		it("rejects attaching a detached field into itself", () => {
			const forest = setupForest();
			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);

			assert.throws(
				() => visitor.attach(rootFieldKey, 5, 0),
				validateAssertionError("Attach source field must be different from current field"),
			);
			afterAssert(forest, visitor);
		});

		it("rejects detaching beyond the source field", () => {
			const forest = setupForest();
			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);

			assert.throws(
				() => visitor.detach({ start: 4, end: 6 }, detachedKey, detachId, false),
				validateAssertionError("Detach range must not exceed field length"),
			);
			afterAssert(forest, visitor);
		});

		it("rejects detaching into the source field", () => {
			const forest = setupForest();
			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);

			assert.throws(
				() => visitor.detach({ start: 1, end: 2 }, rootFieldKey, detachId, false),
				validateAssertionError(
					"Detach destination field must be different from current field",
				),
			);
			afterAssert(forest, visitor);
		});

		it("rejects detaching into an occupied detached field", () => {
			const forest = setupForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor(99)], detachedKey);
			visitor.enterField(rootFieldKey);

			assert.throws(
				() => visitor.detach({ start: 1, end: 2 }, detachedKey, detachId, false),
				validateAssertionError("Detach destination must be a new empty field"),
			);
			afterAssert(forest, visitor);
		});

		it("rejects destroying with a mismatched count", () => {
			const forest = setupForest();
			const visitor = forest.acquireVisitor();
			visitor.create([singleJsonCursor(98), singleJsonCursor(99)], detachedKey);

			assert.throws(
				() => visitor.destroy(detachedKey, 1),
				validateAssertionError("Destroy count must match field length"),
			);
			afterAssert(forest, visitor);
		});
	});

	describe("can clone", () => {
		it("an empty forest", () => {
			const schema = new TreeStoredSchemaRepository();
			const forest = factory(schema);
			const clone = forest.clone(schema);
			const reader = clone.allocateCursor();
			moveToDetachedField(clone, reader);
			// Expect no nodes under the detached field
			assert.equal(reader.firstNode(), false);
		});

		it("primitive nodes", () => {
			const schema = new TreeStoredSchemaRepository(optionalArraySchema);
			const forest = factory(schema);
			const content: JsonCompatible[] = [1, true, "test"];
			initializeForest(forest, fieldJsonCursor(content));

			const clone = forest.clone(schema);
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
			const schema = new TreeStoredSchemaRepository(optionalArraySchema);
			const forest = factory(schema);
			initializeForest(forest, fieldJsonCursor([nestedContent]));

			const clone = forest.clone(schema);
			const reader = clone.allocateCursor();
			moveToDetachedField(clone, reader);
			assert(reader.firstNode());
			const fromClone = cursorToJsonObject(reader);
			assert.deepEqual(nestedContent, fromClone);
		});

		it("clone has an independent anchor set", () => {
			const schema = new TreeStoredSchemaRepository(optionalArraySchema);
			const forest = factory(schema);
			initializeForest(forest, fieldJsonCursor([nestedContent]));

			const clone = forest.clone(schema);

			// The clone must have its own anchor set, not the original's.
			assert.notEqual(clone.anchors, forest.anchors);

			// Anchors built within the clone must resolve in the clone.
			const cloneReader = clone.allocateCursor();
			moveToDetachedField(clone, cloneReader);
			assert(cloneReader.firstNode());
			const cloneAnchor = cloneReader.buildAnchor();
			cloneReader.free();

			const reader = clone.allocateCursor();
			assert.equal(clone.tryMoveCursorToNode(cloneAnchor, reader), TreeNavigationResult.Ok);
		});
	});

	it("editing a cloned forest does not modify the original", () => {
		const schema = new TreeStoredSchemaRepository(jsonSequenceRootSchema);
		const forest = factory(schema);
		const content: JsonableTree[] = [
			{ type: brand(numberSchema.identifier), value: 1 },
			{ type: brand(booleanSchema.identifier), value: true },
			{ type: brand(stringSchema.identifier), value: "test" },
		];
		initializeForest(forest, cursorForJsonableTreeField(content));

		const clone = forest.clone(schema);
		const mark: DeltaMark = { count: 1, detach: detachId };
		const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [mark] }]]);
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
			it("ensures cursors are cleared before applying changes", () => {
				const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
				initializeForest(forest, fieldJsonCursor([1]));
				const cursor = forest.allocateCursor();
				moveToDetachedField(forest, cursor);

				const mark: DeltaMark = { count: 1, detach: detachId };
				const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [mark] }]]);
				assert.throws(() => applyTestDelta(delta, forest));
			});

			it("ensures cursors created in events during delta processing are cleared", () => {
				const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
				initializeForest(forest, fieldJsonCursor([1]));

				const log: string[] = [];
				forest.events.on("beforeChange", () => {
					const cursor = forest.allocateCursor();
					moveToDetachedField(forest, cursor);
					log.push("beforeChange");
				});

				const mark: DeltaMark = { count: 1, detach: detachId };
				const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [mark] }]]);
				assert.throws(() => applyTestDelta(delta, forest));
				assert.deepEqual(log, ["beforeChange"]);
			});
		}

		it("beforeChange events", () => {
			const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
			initializeForest(forest, fieldJsonCursor([1]));

			const log: string[] = [];
			forest.events.on("beforeChange", () => {
				log.push("beforeChange");
			});

			const mark: DeltaMark = { count: 1, detach: detachId };
			const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [mark] }]]);
			applyTestDelta(delta, forest);
			assert.deepEqual(log, ["beforeChange"]);
		});

		it("set fields as remove and insert", () => {
			const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
			initializeForest(forest, fieldJsonCursor([nestedContent]));

			const setField: DeltaMark = {
				count: 1,
				fields: new Map([
					[xField, { marks: [{ count: 1, detach: detachId, attach: buildId }] }],
				]),
			};
			const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [setField] }]]);
			applyTestDelta(delta, forest, {
				build: [
					{
						id: buildId,
						trees: chunkFromJsonableTrees([
							{
								type: brand(booleanSchema.identifier),
								value: true,
							},
						]),
					},
				],
			});

			const reader = forest.allocateCursor();
			moveToDetachedField(forest, reader);
			assert(reader.firstNode());
			reader.enterField(xField);
			assert.equal(reader.firstNode(), true);
			assert.equal(reader.value, true);
		});

		it("set fields as replace", () => {
			const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
			initializeForest(forest, fieldJsonCursor([nestedContent]));

			const setField: DeltaMark = {
				count: 1,
				fields: new Map([
					[xField, { marks: [{ count: 1, detach: detachId, attach: buildId }] }],
				]),
			};
			const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [setField] }]]);
			applyTestDelta(delta, forest, {
				build: [
					{
						id: buildId,
						trees: chunkFromJsonableTrees([
							{
								type: brand(booleanSchema.identifier),
								value: true,
							},
						]),
					},
				],
			});

			const reader = forest.allocateCursor();
			moveToDetachedField(forest, reader);
			assert(reader.firstNode());
			reader.enterField(xField);
			assert.equal(reader.firstNode(), true);
			assert.equal(reader.value, true);
		});

		it("remove", () => {
			const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));
			const content: JsonCompatible[] = [1, 2];
			initializeForest(forest, fieldJsonCursor(content));

			const mark: DeltaMark = {
				count: 1,
				detach: detachId,
			};
			const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [mark] }]]);
			applyTestDelta(delta, forest);

			// Inspect resulting tree: should just have `2`.
			const reader = forest.allocateCursor();
			moveToDetachedField(forest, reader);
			assert(reader.firstNode());
			assert.equal(reader.value, 2);
			assert.equal(reader.nextNode(), false);
		});

		it("a skip", () => {
			const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));
			const content: JsonCompatible[] = [1, 2];
			initializeForest(forest, fieldJsonCursor(content));
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
			const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [skip, mark] }]]);
			applyTestDelta(delta, forest);

			// Inspect resulting tree: should just have `1`.
			const reader = forest.allocateCursor();
			assert.equal(forest.tryMoveCursorToNode(anchor, reader), TreeNavigationResult.Ok);
			assert.equal(reader.value, 1);
			assert.equal(reader.nextNode(), false);
		});

		it("insert", () => {
			const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));
			const content: JsonCompatible[] = [1, 2];
			initializeForest(forest, fieldJsonCursor(content));

			const delta: DeltaFieldMap = new Map([
				[rootFieldKey, { marks: [{ count: 1, attach: buildId }] }],
			]);
			applyTestDelta(delta, forest, {
				build: [{ id: buildId, trees: chunkFromJsonTrees([3]) }],
			});

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
			const forest = factory(new TreeStoredSchemaRepository(optionalArraySchema));

			const moveId = { minor: 1 };
			const moveOut: DeltaMark = {
				count: 1,
				detach: moveId,
			};
			const moveIn: DeltaMark = {
				count: 1,
				attach: moveId,
			};
			const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [moveIn] }]]);
			applyTestDelta(delta, forest, {
				build: [{ id: buildId, trees: chunkFromJsonTrees([{ x: 0 }]) }],
				global: [
					{
						id: buildId,
						fields: new Map([[xField, { marks: [moveOut] }]]),
					},
				],
			});

			const reader = forest.allocateCursor();
			moveToDetachedField(forest, reader);
			assert(reader.firstNode());
			assert.equal(reader.value, 0);
			assert.equal(reader.nextNode(), false);
		});

		it("move out and move in", () => {
			const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
			initializeForest(forest, fieldJsonCursor([nestedContent]));

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
					[xField, { marks: [moveOut] }],
					[yField, { marks: [{ count: 1 }, moveIn] }],
				]),
			};
			const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [modify] }]]);
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
			const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
			const content: JsonCompatible[] = [1, 2];
			initializeForest(forest, fieldJsonCursor(content));

			const delta: DeltaFieldMap = new Map([
				[rootFieldKey, { marks: [{ count: 1, attach: buildId }] }],
			]);
			applyTestDelta(delta, forest, {
				build: [
					{
						id: buildId,
						trees: chunkFromJsonableTrees([
							{
								type: brand(numberSchema.identifier),
								value: 3,
							},
						]),
					},
					{
						id: buildId2,
						trees: chunkFromJsonableTrees([
							{
								type: brand(numberSchema.identifier),
								value: 4,
							},
						]),
					},
				],
				global: [
					{
						id: buildId,
						fields: new Map([
							[brand("newField"), { marks: [{ count: 1, attach: buildId2 }] }],
						]),
					},
				],
			});

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
			const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
			initializeForest(forest, fieldJsonCursor([nestedContent]));

			const moveId = { minor: 0 };
			const mark: DeltaMark = {
				count: 1,
				detach: detachId,
				fields: new Map([[xField, { marks: [{ count: 1, detach: moveId }] }]]),
			};
			const delta: DeltaFieldMap = new Map([
				[rootFieldKey, { marks: [mark, { count: 1, attach: moveId }] }],
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
			const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
			initializeForest(forest, fieldJsonCursor([nestedContent]));

			const moveId = { minor: 0 };
			const mark: DeltaMark = {
				count: 1,
				fields: new Map([
					[
						xField,
						{
							marks: [
								{
									count: 1,
									detach: moveId,
									fields: new Map([
										[
											fooField,
											{
												marks: [
													{
														count: 1,
														detach: detachId,
														attach: buildId,
													},
												],
											},
										],
									]),
								},
							],
						},
					],
					[yField, { marks: [{ count: 1, attach: moveId }] }],
				]),
			};
			const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [mark] }]]);
			applyTestDelta(delta, forest, {
				build: [{ id: buildId, trees: chunkFromJsonTrees([3]) }],
			});

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
			const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
			const delta: DeltaFieldMap = new Map([
				[
					rootFieldKey,
					{
						marks: [
							{
								count: 1,
								fields: new Map([
									[
										xField,
										{
											marks: [
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
			initializeForest(forest, fieldJsonCursor([nestedContent]));
			applyTestDelta(delta, forest);
			const readCursor = forest.allocateCursor();
			moveToDetachedField(forest, readCursor);
			const actual = mapCursorField(readCursor, cursorToJsonObject);
			readCursor.free();
			assert.deepEqual(actual, expected);
		});
		it("when moving the last node in the field", () => {
			const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
			initializeForest(forest, fieldJsonCursor([{ x: 2 }]));
			// Move from field x to y:
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
					[xField, { marks: [moveOut] }],
					[yField, { marks: [moveIn] }],
				]),
			};
			const delta: DeltaFieldMap = new Map([[rootFieldKey, { marks: [modify] }]]);
			applyTestDelta(delta, forest);
			const expectedCursor = singleJsonCursor({ y: 2 });
			const expected: JsonableTree[] = [jsonableTreeFromCursor(expectedCursor)];
			const readCursor = forest.allocateCursor();
			moveToDetachedField(forest, readCursor);
			const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			assert.deepEqual(actual, expected);
		});
	});

	it("can register and deregister announced visitors", () => {
		let treesCreated = 0;
		const acquireVisitor = () => {
			return createAnnouncedVisitor({
				afterCreate: () => {
					treesCreated++;
				},
			});
		};

		const forest = factory(new TreeStoredSchemaRepository(jsonSequenceRootSchema));
		const content: JsonCompatible[] = [1, 2];
		initializeForest(forest, fieldJsonCursor(content));

		forest.registerAnnouncedVisitor(acquireVisitor);
		const delta: DeltaFieldMap = new Map([
			[rootFieldKey, { marks: [{ count: 1, attach: buildId }] }],
		]);
		applyTestDelta(delta, forest, {
			build: [{ id: buildId, trees: chunkFromJsonTrees([3]) }],
		});

		forest.deregisterAnnouncedVisitor(acquireVisitor);
		applyTestDelta(delta, forest, {
			build: [{ id: buildId, trees: chunkFromJsonTrees([4]) }],
		});

		assert.equal(treesCreated, 1);
	});

	testGeneralPurposeTreeCursor(
		"forest cursor",
		(data): ITreeCursor => {
			const forest = factory(new TreeStoredSchemaRepository(toInitialSchema(testTreeSchema)));
			initializeForest(forest, cursorForJsonableTreeField([data]));
			const cursor = forest.allocateCursor();
			moveToDetachedField(forest, cursor);
			assert(cursor.firstNode());
			return cursor;
		},
		jsonableTreeFromCursor,
		true,
	);
}
