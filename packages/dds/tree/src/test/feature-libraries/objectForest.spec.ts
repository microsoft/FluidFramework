/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	type FieldKey,
	initializeForest,
	moveToDetachedField,
	rootFieldKey,
} from "../../core/index.js";
import { fieldJsonCursor } from "../json/index.js";
import { cursorForMapTreeNode } from "../../feature-libraries/index.js";
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { buildForest } from "../../feature-libraries/object-forest/index.js";
import { type JsonCompatible, brand } from "../../util/index.js";
import { testForest } from "../forestTestSuite.js";
import { testIdCompressor, testRevisionTagCodec } from "../utils.js";

describe("object-forest", () => {
	testForest({
		suiteName: "forest suite",
		factory: (schema) => buildForest(),
	});

	const content: JsonCompatible = {
		x: { foo: 2 },
	};
	const detachedFieldKey: FieldKey = brand("detached");

	describe("Throws an error for invalid edits", () => {
		it("attaching content into the detached field it is being transferred from", () => {
			const forest = buildForest();
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
			const forest = buildForest();
			initializeForest(
				forest,
				fieldJsonCursor([content]),
				testRevisionTagCodec,
				testIdCompressor,
			);
			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			assert.throws(
				() => visitor.detach({ start: 0, end: 1 }, rootFieldKey),
				(e: Error) =>
					validateAssertionError(
						e,
						/Detach destination field must be different from current field/,
					),
			);
			visitor.exitField(rootFieldKey);
			visitor.free();
		});

		it("replacing content by transferring to and from the same detached field", () => {
			const forest = buildForest();
			initializeForest(
				forest,
				fieldJsonCursor([content]),
				testRevisionTagCodec,
				testIdCompressor,
			);
			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			assert.throws(
				() => visitor.replace(detachedFieldKey, { start: 0, end: 1 }, detachedFieldKey),
				(e: Error) =>
					validateAssertionError(
						e,
						/Replace detached source field and detached destination field must be different/,
					),
			);
			visitor.exitField(rootFieldKey);
			visitor.free();
		});
	});

	it("moveCursorToPath with an undefined path points to dummy node above detachedFields.", () => {
		const forest = buildForest();
		initializeForest(
			forest,
			fieldJsonCursor([[1, 2]]),
			testRevisionTagCodec,
			testIdCompressor,
		);
		const cursor = forest.allocateCursor();
		forest.moveCursorToPath(undefined, cursor);
		assert.deepEqual(cursor.getFieldKey(), cursorForMapTreeNode(forest.roots).getFieldKey());
	});

	it("uses cursor sources in errors", () => {
		const forest = buildForest();
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
});
