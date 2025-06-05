/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type IForestSubscription,
	type UpPath,
	moveToDetachedField,
	type Anchor,
	type ITreeSubscriptionCursor,
	TreeNavigationResult,
	type Value,
	getDetachedFieldContainingPath,
	rootField,
	type TreeValue,
	forEachNodeInSubtree,
} from "../core/index.js";
import { TreeStatus } from "../feature-libraries/index.js";

/**
 * A helper class for common anchor operation.
 */
export class TestAnchor {
	public constructor(
		public readonly forest: IForestSubscription,
		public readonly anchor: Anchor,
	) {}

	/**
	 * @returns a `TestAnchor` for the node at the given path.
	 */
	public static fromPath(forest: IForestSubscription, path: UpPath): TestAnchor {
		const cursor = forest.allocateCursor();
		forest.moveCursorToPath(path, cursor);
		const anchor = cursor.buildAnchor();
		cursor.free();
		return new TestAnchor(forest, anchor);
	}

	/**
	 * @returns a `TestAnchor` for the node with the given value.
	 * Fails if the value is not found or found multiple times in the tree.
	 */
	public static fromValue(forest: IForestSubscription, value: TreeValue): TestAnchor {
		const cursor = forest.allocateCursor();
		moveToDetachedField(forest, cursor);
		const paths: UpPath[] = [];
		forEachNodeInSubtree(cursor, (c): void => {
			if (Object.is(c.value, value)) {
				paths.push(c.getPath() ?? assert.fail("Expected path"));
			}
		});
		cursor.free();
		if (paths.length < 1) {
			assert.fail("Value not found in tree");
		}
		if (paths.length > 1) {
			assert.fail("Value found multiple times in tree");
		}
		return TestAnchor.fromPath(forest, paths[0]);
	}

	public get treeStatus(): TreeStatus {
		const location = this.forest.anchors.locate(this.anchor);
		if (location === undefined) {
			return TreeStatus.Deleted;
		}
		const field = getDetachedFieldContainingPath(location);
		return field === rootField ? TreeStatus.InDocument : TreeStatus.Removed;
	}

	/**
	 * @returns A cursor that is positioned at the anchor.
	 * The cursor is owned (and therefore must be freed) by the caller.
	 */
	public acquireCursor(): ITreeSubscriptionCursor {
		const cursor = this.forest.allocateCursor();
		const navigationResult = this.forest.tryMoveCursorToNode(this.anchor, cursor);
		assert.equal(navigationResult, TreeNavigationResult.Ok);
		return cursor;
	}

	public assertHasValue(expectedValue: Value): void {
		const cursor = this.acquireCursor();
		assert.equal(cursor.value, expectedValue);
		cursor.free();
	}
}
