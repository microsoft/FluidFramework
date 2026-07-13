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
	type FieldAnchor,
	type FieldKey,
	type ForestEvents,
	type IEditableForest,
	type IForestSubscription,
	type ITreeCursorSynchronous,
	type ITreeSubscriptionCursor,
	type JsonableTree,
	type TreeChunk,
	type TreeNavigationResult,
	type TreeStoredSchemaSubscription,
	type UpPath,
	combineVisitors,
	createAnnouncedVisitor,
	genericTreeKeys,
	getGenericTreeField,
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

/**
 * Extracts the full contents of a forest (every detached field, keyed by field key) as {@link JsonableTree}s.
 */
function detachedFieldsContent(forest: IForestSubscription): Map<FieldKey, JsonableTree[]> {
	const cursor = forest.getCursorAboveDetachedFields();
	const content = new Map<FieldKey, JsonableTree[]>();
	for (let hasField = cursor.firstField(); hasField; hasField = cursor.nextField()) {
		content.set(cursor.getFieldKey(), mapCursorField(cursor, jsonableTreeFromCursor));
	}
	return content;
}

/**
 * Structural equality for the {@link JsonableTree} content of two forests, keyed by detached field.
 *
 * @remarks
 * Fields are compared as an unordered set of keys, so this is independent of the order in which different
 * forest implementations enumerate fields. The nodes within each field are compared in order.
 *
 * Implemented iteratively (using an explicit work stack rather than recursion) so that comparing deeply
 * nested trees does not risk exhausting the call stack.
 */
function forestContentEquals(
	main: ReadonlyMap<FieldKey, JsonableTree[]>,
	reference: ReadonlyMap<FieldKey, JsonableTree[]>,
): boolean {
	// Aligned pairs of nodes still to be compared.
	const stack: [JsonableTree, JsonableTree][] = [];

	// Queue each aligned pair of nodes from the two fields for comparison.
	// Returns false if the fields have differing numbers of nodes.
	const queueFieldNodes = (
		mainNodes: JsonableTree[],
		referenceNodes: JsonableTree[],
	): boolean => {
		if (mainNodes.length !== referenceNodes.length) {
			return false;
		}
		for (let index = 0; index < mainNodes.length; index += 1) {
			stack.push([mainNodes[index], referenceNodes[index]]);
		}
		return true;
	};

	if (main.size !== reference.size) {
		return false;
	}
	for (const [key, mainNodes] of main) {
		const referenceNodes = reference.get(key);
		if (referenceNodes === undefined || !queueFieldNodes(mainNodes, referenceNodes)) {
			return false;
		}
	}

	for (let pair = stack.pop(); pair !== undefined; pair = stack.pop()) {
		const [mainNode, referenceNode] = pair;
		if (mainNode.type !== referenceNode.type || !Object.is(mainNode.value, referenceNode.value)) {
			return false;
		}
		// JsonableTree never stores empty fields, so equal key counts plus a matching (non-empty) field
		// for every key in `mainNode` implies `referenceNode` has no extra fields.
		const mainKeys = genericTreeKeys(mainNode);
		if (mainKeys.length !== genericTreeKeys(referenceNode).length) {
			return false;
		}
		for (const key of mainKeys) {
			if (
				!queueFieldNodes(
					getGenericTreeField(mainNode, key, false),
					getGenericTreeField(referenceNode, key, false),
				)
			) {
				return false;
			}
		}
	}
	return true;
}

/**
 * Best-effort human readable serialization of forest content for error messages.
 * Falls back to a placeholder if the content is too deeply nested to serialize.
 */
function describeContent(content: ReadonlyMap<FieldKey, JsonableTree[]>): string {
	try {
		return JSON.stringify(Object.fromEntries(content));
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
	if (!forestContentEquals(mainContent, referenceContent)) {
		fail(
			"ComparisonForest: main forest diverged from reference forest after applying a delta",
			() =>
				`Main:      ${describeContent(mainContent)}\nReference: ${describeContent(referenceContent)}`,
		);
	}
}
