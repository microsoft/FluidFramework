/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable } from "@fluidframework/core-interfaces";

import {
	type Anchor,
	type AnchorSet,
	type AnnouncedVisitor,
	type DeltaVisitor,
	type FieldAnchor,
	type ForestEvents,
	type IEditableForest,
	type ITreeCursorSynchronous,
	type ITreeSubscriptionCursor,
	type TreeChunk,
	type TreeNavigationResult,
	type TreeStoredSchemaSubscription,
	type UpPath,
	combineVisitors,
	createAnnouncedVisitor,
} from "../../core/index.js";
import type { Breakable } from "../../util/index.js";

import { assertForestsEqual } from "../treeTextCursor.js";

/**
 * An {@link IEditableForest} which wraps two other forests: a `main` forest and a `reference` forest.
 *
 * @remarks
 * All read operations are delegated to `main`, so from the outside a `ComparisonForest` behaves exactly like its `main` forest.
 *
 * When a delta is applied (via {@link IEditableForest.acquireVisitor}), the delta is applied to both `main` and `reference`.
 * Once the visitor is freed, the full contents of both forests (including all detached/removed fields) are compared,
 * and an error is thrown if they differ.
 *
 * This is a testing/debugging aid: it allows validating that a forest implementation (for example the optimized `ChunkedForest`)
 * produces the same results as a simpler reference implementation (for example the `ObjectForest`) for every delta that is applied.
 *
 * @privateRemarks
 * This forest is intentionally expensive: it maintains two full copies of the data and re-reads and
 * structurally compares all of their contents after every delta.
 */
export class ComparisonForest implements IEditableForest {
	/**
	 * @param main - The forest whose behavior is under test.
	 * All reads are delegated to this forest, and it is the source of truth for anchors and events.
	 * @param reference - The forest to compare against.
	 * This forest receives all the same deltas as `main`, and its contents are asserted to match `main` after each delta.
	 */
	public constructor(
		public readonly main: IEditableForest,
		public readonly reference: IEditableForest,
	) {}

	public get events(): Listenable<ForestEvents> {
		return this.main.events;
	}

	public get anchors(): AnchorSet {
		return this.main.anchors;
	}

	public get isEmpty(): boolean {
		return this.main.isEmpty;
	}

	public clone(schema: TreeStoredSchemaSubscription, breaker?: Breakable): ComparisonForest {
		return new ComparisonForest(
			this.main.clone(schema, breaker),
			this.reference.clone(schema, breaker),
		);
	}

	public chunkField(cursor: ITreeCursorSynchronous): TreeChunk[] {
		return this.main.chunkField(cursor);
	}

	public allocateCursor(source?: string): ITreeSubscriptionCursor {
		// Currently we just use the cursor from "main", but we could use "reference" or a custom cursor ensuring both match in behavior.
		// TODO: Add a custom combined cursor type which validates two cursors match, and use it here.
		return this.main.allocateCursor(source);
	}

	public forgetAnchor(anchor: Anchor): void {
		this.main.forgetAnchor(anchor);
	}

	public tryMoveCursorToNode(
		destination: Anchor,
		cursorToMove: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.main.tryMoveCursorToNode(destination, cursorToMove);
	}

	public tryMoveCursorToField(
		destination: FieldAnchor,
		cursorToMove: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.main.tryMoveCursorToField(destination, cursorToMove);
	}

	public moveCursorToPath(destination: UpPath, cursorToMove: ITreeSubscriptionCursor): void {
		this.main.moveCursorToPath(destination, cursorToMove);
	}

	public getCursorAboveDetachedFields(): ITreeCursorSynchronous {
		return this.main.getCursorAboveDetachedFields();
	}

	public registerAnnouncedVisitor(visitor: () => AnnouncedVisitor): void {
		this.main.registerAnnouncedVisitor(visitor);
	}

	public deregisterAnnouncedVisitor(visitor: () => AnnouncedVisitor): void {
		this.main.deregisterAnnouncedVisitor(visitor);
	}

	public acquireVisitor(): DeltaVisitor {
		const main = this.main;
		const reference = this.reference;
		const mainVisitor = main.acquireVisitor();
		const referenceVisitor = reference.acquireVisitor();
		// A visitor which does nothing except assert the two forests match once the delta has been fully applied to both.
		const comparisonVisitor = createAnnouncedVisitor({
			free: () => assertForestsEqual(main, reference),
		});
		return combineVisitors([mainVisitor, referenceVisitor, comparisonVisitor]);
	}
}
