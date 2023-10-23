/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { buildForest } from "../../feature-libraries/object-forest";
import { FieldKey, initializeForest, rootFieldKey } from "../../core";
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

	describe("Throws an error for invalid edits", () => {
		it("attaching content into the detached field it is being transferred from", () => {
			const forest = buildForest();
			initializeForest(forest, [singleJsonCursor(content)]);
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
			initializeForest(forest, [singleJsonCursor(content)]);
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
			initializeForest(forest, [singleJsonCursor(content)]);
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
});
