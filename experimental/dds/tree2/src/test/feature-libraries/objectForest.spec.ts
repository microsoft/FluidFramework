/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { buildForest } from "../../feature-libraries/object-forest";
import { FieldKey, ReplaceKind, initializeForest, rootFieldKey } from "../../core";
import { JsonCompatible, brand } from "../../util";

import { testForest } from "../forestTestSuite";
import { singleJsonCursor } from "../../domains";

describe("object-forest", () => {
	testForest({
		suiteName: "forest suite",
		factory: (schema) => buildForest(),
	});

	const content: JsonCompatible = {
		x: { foo: 2 },
	};
	const detachedFieldKey: FieldKey = brand("detached");

	describe("Throws a helpful error for invalid edits", () => {
		it("attaching content into the detached field it is being transferred from", () => {
			const forest = buildForest();
			initializeForest(forest, [singleJsonCursor(content)]);
			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			assert.throws(
				() => visitor.attach(brand({ field: rootFieldKey, start: 0, end: 1 }), 0),
				/Attach source field must be different from current field/,
			);
			visitor.exitField(rootFieldKey);
			visitor.free();
		});
		it("detaching content from the detached field it is being transferred to", () => {
			const forest = buildForest();
			initializeForest(forest, [singleJsonCursor(content)]);
			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			assert.throws(
				() =>
					visitor.detach({ start: 0, end: 1 }, brand({ field: rootFieldKey, index: 0 })),
				/Detach destination field must be different from current field/,
			);
			visitor.exitField(rootFieldKey);
			visitor.free();
		});
		it("replacing content by transferring to and from the same detached field", () => {
			const forest = buildForest();
			initializeForest(forest, [singleJsonCursor(content)]);
			const visitor = forest.acquireVisitor();
			visitor.enterField(rootFieldKey);
			assert.throws(
				() =>
					visitor.replace(
						brand({ field: detachedFieldKey, start: 0, end: 1 }),
						{ start: 0, end: 1 },
						brand({ field: detachedFieldKey, index: 0 }),
						ReplaceKind.CellPerfect,
					),
				/Replace detached source field and detached destination field must be different/,
			);
			visitor.exitField(rootFieldKey);
			visitor.free();
		});
	});
});
