/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	type FieldKey,
	moveToDetachedField,
	rootFieldKey,
	TreeStoredSchemaRepository,
} from "../../core/index.js";
import { cursorForMapTreeNode, initializeForest } from "../../feature-libraries/index.js";
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { buildForest } from "../../feature-libraries/object-forest/index.js";
import { Breakable, type JsonCompatible, brand } from "../../util/index.js";
import { testForest } from "../forestTestSuite.js";
import { testIdCompressor, testRevisionTagCodec, validateUsageError } from "../utils.js";
import { fieldJsonCursor } from "../json/index.js";
import { toStoredSchema, SchemaFactory } from "../../simple-tree/index.js";

describe("object-forest", () => {
	describe("forest suite", () => {
		testForest({
			factory: (schema) => buildForest(new Breakable("testForest")),
		});
	});

	// TODO: the forest test suite should be able to run with the additional assertions.
	// Currently many of its tests fail due to schema violations.
	describe.skip("forest suite additional assertions", () => {
		testForest({
			factory: (schema) => buildForest(new Breakable("testForest"), schema, undefined, true),
		});
	});

	const content: JsonCompatible = {
		x: { foo: 2 },
	};
	const detachedFieldKey: FieldKey = brand("detached");

	// used for calling delta visitor functions, the actual value doesn't matter for these tests
	const dummyDetachedNodeId = { minor: 0 };

	describe("Throws an error for invalid edits", () => {
		it("attaching content into the detached field it is being transferred from", () => {
			const forest = buildForest(new Breakable("test"));
			initializeForest(
				forest,
				fieldJsonCursor([content]),
				testRevisionTagCodec,
				testIdCompressor,
			);
			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			assert.throws(
				() => visitor.attach(rootFieldKey, 1, 0),
				(e: Error) =>
					validateAssertionError(
						e,
						/Attach source field must be different from current field/,
					),
			);
			visitor.exitField(rootFieldKey);
			visitor.free();
		});

		it("detaching content from the detached field it is being transferred to", () => {
			const forest = buildForest(new Breakable("test"));
			initializeForest(
				forest,
				fieldJsonCursor([content]),
				testRevisionTagCodec,
				testIdCompressor,
			);
			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			assert.throws(
				() => visitor.detach({ start: 0, end: 1 }, rootFieldKey, dummyDetachedNodeId, false),
				(e: Error) =>
					validateAssertionError(
						e,
						/Detach destination field must be different from current field/,
					),
			);
			visitor.exitField(rootFieldKey);
			visitor.free();
		});
	});

	it("moveCursorToPath with an undefined path points to dummy node above detachedFields.", () => {
		const forest = buildForest(new Breakable("test"));
		initializeForest(
			forest,
			fieldJsonCursor([[1, 2]]),
			testRevisionTagCodec,
			testIdCompressor,
		);
		const cursor = forest.allocateCursor();
		forest.moveCursorToPath(undefined, cursor);
		assert.deepEqual(cursor.fieldIndex, cursorForMapTreeNode(forest.roots).fieldIndex);
	});

	it("uses cursor sources in errors", () => {
		const forest = buildForest(new Breakable("test"));
		initializeForest(
			forest,
			fieldJsonCursor([content]),
			testRevisionTagCodec,
			testIdCompressor,
		);
		const named = forest.allocateCursor("named");
		moveToDetachedField(forest, named);
		const forkOfNamed = named.fork();
		const namedFork = named.fork("namedFork");
		const unnamed = forest.allocateCursor();
		moveToDetachedField(forest, unnamed);
		const forkOfUnnamed = unnamed.fork();
		const visitor = forest.acquireVisitor();
		visitor.enterField(rootFieldKey);
		assert.throws(
			() => visitor.destroy(detachedFieldKey, 1),
			(error: Error) =>
				validateAssertionError(
					error,
					`Found unexpected cursors when editing with the following annotations: ["named","fork: named","namedFork",null,"fork: undefined"]`,
				),
		);
		visitor.exitField(rootFieldKey);
		visitor.free();
	});

	it("additional asserts validates schema of initial content", () => {
		assert.throws(
			() =>
				buildForest(
					new Breakable("test"),
					// Required field, but not content: should error.
					new TreeStoredSchemaRepository(toStoredSchema(SchemaFactory.string)),
					undefined,
					true,
				),
			validateUsageError(/Tree does not conform to schema/),
		);
	});

	it("additional asserts validates schema after edit", () => {
		const forest = buildForest(
			new Breakable("test"),
			// Field allowing nothing
			new TreeStoredSchemaRepository(toStoredSchema(SchemaFactory.optional([]))),
			undefined,
			true,
		);
		assert.throws(
			() =>
				// Adds something to field which allows nothing: should error.
				initializeForest(
					forest,
					fieldJsonCursor(["root"]),
					testRevisionTagCodec,
					testIdCompressor,
				),
			validateUsageError(/Tree does not conform to schema/),
		);
	});
});
