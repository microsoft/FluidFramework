/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable } from "@fluidframework/core-interfaces";
import { fail } from "@fluidframework/core-utils/internal";

import {
	type Anchor,
	type AnchorSet,
	type AnnouncedVisitor,
	type DeltaVisitor,
	type DeltaDetachedNodeId,
	type FieldAnchor,
	type FieldKey,
	type ForestEvents,
	type IEditableForest,
	type IForestSubscription,
	type ITreeCursorSynchronous,
	type ITreeSubscriptionCursor,
	type JsonableTree,
	type PlaceIndex,
	type Range,
	type TreeChunk,
	type TreeNavigationResult,
	type TreeStoredSchemaSubscription,
	type UpPath,
	mapCursorField,
} from "../../core/index.js";
import type { Breakable } from "../../util/index.js";

import { jsonableTreeFromCursor } from "../treeTextCursor.js";

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
		const visitor: DeltaVisitor = {
			free(): void {
				mainVisitor.free();
				referenceVisitor.free();
				assertForestsEqual(main, reference);
			},
			create(content: readonly ITreeCursorSynchronous[], destination: FieldKey): void {
				mainVisitor.create(content, destination);
				referenceVisitor.create(content, destination);
			},
			destroy(detachedField: FieldKey, count: number): void {
				mainVisitor.destroy(detachedField, count);
				referenceVisitor.destroy(detachedField, count);
			},
			attach(source: FieldKey, count: number, destination: PlaceIndex): void {
				mainVisitor.attach(source, count, destination);
				referenceVisitor.attach(source, count, destination);
			},
			detach(
				source: Range,
				destination: FieldKey,
				id: DeltaDetachedNodeId,
				isReplaced: boolean,
			): void {
				mainVisitor.detach(source, destination, id, isReplaced);
				referenceVisitor.detach(source, destination, id, isReplaced);
			},
			enterNode(index: number): void {
				mainVisitor.enterNode(index);
				referenceVisitor.enterNode(index);
			},
			exitNode(index: number): void {
				mainVisitor.exitNode(index);
				referenceVisitor.exitNode(index);
			},
			enterField(key: FieldKey): void {
				mainVisitor.enterField(key);
				referenceVisitor.enterField(key);
			},
			exitField(key: FieldKey): void {
				mainVisitor.exitField(key);
				referenceVisitor.exitField(key);
			},
		};
		return visitor;
	}
}

/**
 * Extracts the full contents of a forest (every detached field, keyed by field key) into a plain,
 * comparable representation.
 */
function detachedFieldsContent(forest: IForestSubscription): Record<string, JsonableTree[]> {
	const cursor = forest.getCursorAboveDetachedFields();
	const content: Record<string, JsonableTree[]> = {};
	for (let hasField = cursor.firstField(); hasField; hasField = cursor.nextField()) {
		content[cursor.getFieldKey()] = mapCursorField(cursor, jsonableTreeFromCursor);
	}
	return content;
}

/**
 * Deep structural equality for the plain data produced by {@link detachedFieldsContent}.
 *
 * @remarks
 * Object keys (for example field keys) are compared as an unordered set, so this is independent of the
 * order in which different forest implementations happen to enumerate fields. Array indices are just
 * numeric keys, so array elements are still compared position-by-position.
 *
 * This is implemented iteratively (using an explicit work stack rather than recursion) so that comparing
 * deeply nested trees does not risk exhausting the call stack.
 */
function deepEqual(a: unknown, b: unknown): boolean {
	const stack: [unknown, unknown][] = [[a, b]];
	for (let pair = stack.pop(); pair !== undefined; pair = stack.pop()) {
		const [x, y] = pair;
		if (Object.is(x, y)) {
			continue;
		}
		if (typeof x !== "object" || typeof y !== "object" || x === null || y === null) {
			return false;
		}
		if (Array.isArray(x) !== Array.isArray(y)) {
			return false;
		}
		const xRecord = x as Record<string, unknown>;
		const yRecord = y as Record<string, unknown>;
		const xKeys = Object.keys(xRecord);
		if (xKeys.length !== Object.keys(yRecord).length) {
			return false;
		}
		for (const key of xKeys) {
			if (!Object.prototype.hasOwnProperty.call(yRecord, key)) {
				return false;
			}
			stack.push([xRecord[key], yRecord[key]]);
		}
	}
	return true;
}

/**
 * Best-effort human readable serialization of forest content for error messages.
 * Falls back to a placeholder if the content is too deeply nested to serialize.
 */
function describeContent(content: Record<string, JsonableTree[]>): string {
	try {
		return JSON.stringify(content);
	} catch {
		return "<content too large to serialize>";
	}
}

/**
 * Asserts that two forests have identical contents (including all detached/removed fields).
 * @throws an Error describing the divergence if the forests differ.
 */
export function assertForestsEqual(
	main: IForestSubscription,
	reference: IForestSubscription,
): void {
	const mainContent = detachedFieldsContent(main);
	const referenceContent = detachedFieldsContent(reference);
	if (!deepEqual(mainContent, referenceContent)) {
		fail(
			`ComparisonForest: main forest diverged from reference forest after applying a delta.\nMain:      ${describeContent(mainContent)}\nReference: ${describeContent(referenceContent)}`,
		);
	}
}
