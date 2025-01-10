/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable } from "@fluidframework/core-interfaces";

import {
	type Anchor,
	AnchorSet,
	type AnnouncedVisitor,
	type CursorLocationType,
	type DeltaVisitor,
	type DetachedField,
	type FieldAnchor,
	type FieldKey,
	type FieldUpPath,
	type ForestEvents,
	type IEditableForest,
	type ITreeCursor,
	type ITreeCursorSynchronous,
	type ITreeSubscriptionCursor,
	ITreeSubscriptionCursorState,
	type MapTree,
	type PathRootPrefix,
	type PlaceIndex,
	type ProtoNodes,
	type Range,
	TreeNavigationResult,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchemaSubscription,
	type UpPath,
	type Value,
	aboveRootPlaceholder,
	combineVisitors,
	deepCopyMapTree,
} from "../../core/index.js";
import {
	assertNonNegativeSafeInteger,
	assertValidIndex,
	assertValidRange,
	brand,
	fail,
} from "../../util/index.js";
import { cursorForMapTreeNode, mapTreeFromCursor } from "../mapTreeCursor.js";
import { type CursorWithNode, SynchronousCursor } from "../treeCursorUtils.js";

/** A `MapTree` with mutable fields */
interface MutableMapTree extends MapTree {
	readonly fields: Map<FieldKey, MutableMapTree[]>;
}

/** Get a field from a `MutableMapTree`, optionally modifying the tree to create it if missing. */
function getOrCreateField(mapTree: MutableMapTree, key: FieldKey): MutableMapTree[] {
	const field = mapTree.fields.get(key);
	if (field !== undefined) {
		return field;
	}

	const newField: MutableMapTree[] = [];
	mapTree.fields.set(key, newField);
	return newField;
}

/**
 * Reference implementation of IEditableForest.
 *
 * This implementation focuses on correctness and simplicity, not performance.
 * It does not use compressed chunks: instead nodes are implemented using objects.
 */
export class ObjectForest implements IEditableForest {
	private activeVisitor?: DeltaVisitor;

	// All cursors that are in the "Current" state. Must be empty when editing.
	public readonly currentCursors: Set<Cursor> = new Set();
	private readonly deltaVisitors: Set<() => AnnouncedVisitor> = new Set();

	readonly #events = createEmitter<ForestEvents>();
	public readonly events: Listenable<ForestEvents> = this.#events;

	readonly #roots: MutableMapTree;
	public get roots(): MapTree {
		return this.#roots;
	}

	public constructor(
		public readonly anchors: AnchorSet = new AnchorSet(),
		public readonly additionalAsserts: boolean = false,
		roots?: MapTree,
	) {
		this.#roots =
			roots !== undefined
				? deepCopyMapTree(roots)
				: {
						type: aboveRootPlaceholder,
						fields: new Map(),
					};
	}

	public get isEmpty(): boolean {
		return this.roots.fields.size === 0;
	}

	public clone(_: TreeStoredSchemaSubscription, anchors: AnchorSet): ObjectForest {
		return new ObjectForest(anchors, this.additionalAsserts, this.roots);
	}

	public forgetAnchor(anchor: Anchor): void {
		this.anchors.forget(anchor);
	}

	public acquireVisitor(): DeltaVisitor {
		assert(
			this.activeVisitor === undefined,
			0x76c /* Must release existing visitor before acquiring another */,
		);

		// Note: This code uses cursors, however it also modifies the tree.
		// In general this is not safe, but this code happens to only modify the tree below the current cursor location,
		// which happens to work.
		// This pattern could be generalized/formalized with a concept of an exclusive cursor,
		// which can edit, but is the only cursor allowed at the time.

		const cursor: Cursor = this.allocateCursor("acquireVisitor");
		cursor.setToAboveDetachedSequences();

		/**
		 * Called before each edit to allow cursor cleanup to happen and ensure that there are no unexpected cursors.
		 * This is required for each change since there may be app facing change event handlers which create cursors.
		 */
		const preEdit = (): void => {
			this.#events.emit("beforeChange");
			assert(
				this.currentCursors.has(cursor),
				0x995 /* missing visitor cursor while editing */,
			);
			if (this.currentCursors.size > 1) {
				const unexpectedSources = [...this.currentCursors].flatMap((c) =>
					c === cursor ? [] : (c.source ?? null),
				);

				throw new Error(
					`Found unexpected cursors when editing with the following annotations: ${JSON.stringify(
						unexpectedSources,
					)}`,
				);
			}
		};

		class Visitor implements DeltaVisitor {
			public constructor(private readonly forest: ObjectForest) {}
			public free(): void {
				cursor.free();
				assert(
					this.forest.activeVisitor !== undefined,
					0x76d /* Multiple free calls for same visitor */,
				);
				this.forest.activeVisitor = undefined;
			}
			public destroy(detachedField: FieldKey, count: number): void {
				preEdit();
				this.forest.delete(detachedField);
			}
			public create(content: ProtoNodes, destination: FieldKey): void {
				preEdit();
				this.forest.add(content, destination);
				this.forest.#events.emit("afterRootFieldCreated", destination);
			}
			public attach(source: FieldKey, count: number, destination: PlaceIndex): void {
				preEdit();
				this.attachEdit(source, count, destination);
			}
			public detach(source: Range, destination: FieldKey): void {
				preEdit();
				this.detachEdit(source, destination);
			}
			/**
			 * Attaches the nodes from the given source field into the current field.
			 * Does not invalidate dependents.
			 * @param source - The the range to be attached.
			 * @param count - The number of nodes being attached.
			 * Expected to match the number of nodes in the source detached field.
			 * @param destination - The index in the current field at which to attach the content.
			 */
			private attachEdit(source: FieldKey, count: number, destination: PlaceIndex): void {
				assertNonNegativeSafeInteger(count);
				if (count === 0) {
					return;
				}
				const [parent, key] = cursor.getParent();
				assert(
					parent !== this.forest.roots || key !== source,
					0x7b6 /* Attach source field must be different from current field */,
				);
				const currentField = getOrCreateField(parent, key);
				assertValidIndex(destination, currentField, true);
				const sourceField = this.forest.#roots.fields.get(source) ?? [];
				assert(sourceField !== undefined, 0x7b7 /* Attach source field must exist */);
				assert(
					sourceField.length === count,
					0x7b8 /* Attach must consume all nodes in source field */,
				);
				// TODO: this will fail for very large insertions due to argument limits.
				currentField.splice(destination, 0, ...sourceField);
				this.forest.delete(source);
			}
			/**
			 * Detaches the range from the current field and transfers it to the given destination if any.
			 * Does not invalidate dependents.
			 * @param source - The bounds of the range to be detached from the current field.
			 * @param destination - If specified, the destination to transfer the detached range to.
			 * If not specified, the detached range is destroyed.
			 */
			private detachEdit(source: Range, destination: FieldKey | undefined): void {
				const [parent, key] = cursor.getParent();
				assert(
					destination === undefined || parent !== this.forest.roots || key !== destination,
					0x7b9 /* Detach destination field must be different from current field */,
				);
				const currentField = getOrCreateField(parent, key);
				assertValidRange(source, currentField);
				const content = currentField.splice(source.start, source.end - source.start);
				if (destination !== undefined) {
					this.forest.addFieldAsDetached(content, destination);
				}
				// This check is performed after the transfer to ensure that the field is not removed in scenarios
				// where the source and destination are the same.
				if (currentField.length === 0) {
					parent.fields.delete(key);
				}
			}
			public replace(
				newContentSource: FieldKey,
				range: Range,
				oldContentDestination: FieldKey,
			): void {
				preEdit();
				assert(
					newContentSource !== oldContentDestination,
					0x7ba /* Replace detached source field and detached destination field must be different */,
				);
				this.detachEdit(range, oldContentDestination);
				this.attachEdit(newContentSource, range.end - range.start, range.start);
			}
			public enterNode(index: number): void {
				cursor.enterNode(index);
			}
			public exitNode(index: number): void {
				cursor.exitNode();
			}
			public enterField(key: FieldKey): void {
				cursor.enterField(key);
			}
			public exitField(key: FieldKey): void {
				cursor.exitField();
			}
		}

		const forestVisitor = new Visitor(this);
		const announcedVisitors: AnnouncedVisitor[] = [];
		this.deltaVisitors.forEach((getVisitor) => announcedVisitors.push(getVisitor()));
		const combinedVisitor = combineVisitors(
			[forestVisitor, ...announcedVisitors],
			announcedVisitors,
		);
		this.activeVisitor = combinedVisitor;
		return combinedVisitor;
	}

	public registerAnnouncedVisitor(visitor: () => AnnouncedVisitor): void {
		this.deltaVisitors.add(visitor);
	}

	public deregisterAnnouncedVisitor(visitor: () => AnnouncedVisitor): void {
		this.deltaVisitors.delete(visitor);
	}

	private nextRange = 0;
	public newDetachedField(): DetachedField {
		const range: DetachedField = brand(String(this.nextRange));
		this.nextRange += 1;
		return range;
	}

	private add(nodes: Iterable<ITreeCursor>, key: FieldKey): void {
		const field = Array.from(nodes, mapTreeFromCursor) as MutableMapTree[];
		this.addFieldAsDetached(field, key);
	}

	private addFieldAsDetached(field: MutableMapTree[], key: FieldKey): void {
		assert(!this.roots.fields.has(key), 0x370 /* new range must not already exist */);
		if (field.length > 0) {
			this.#roots.fields.set(key, field);
		}
	}

	private delete(field: FieldKey): void {
		this.#roots.fields.delete(field);
	}

	public allocateCursor(source?: string): Cursor {
		return new Cursor(this, source);
	}

	public tryMoveCursorToNode(
		destination: Anchor,
		cursorToMove: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		const path = this.anchors.locate(destination);
		if (path === undefined) {
			return TreeNavigationResult.NotFound;
		}
		this.moveCursorToPath(path, cursorToMove);
		return TreeNavigationResult.Ok;
	}

	public tryMoveCursorToField(
		destination: FieldAnchor,
		cursorToMove: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		if (destination.parent === undefined) {
			this.moveCursorToPath(undefined, cursorToMove);
		} else {
			const result = this.tryMoveCursorToNode(destination.parent, cursorToMove);
			if (result !== TreeNavigationResult.Ok) {
				return result;
			}
		}
		cursorToMove.enterField(destination.fieldKey);
		return TreeNavigationResult.Ok;
	}

	public moveCursorToPath(
		destination: UpPath | undefined,
		cursorToMove: ITreeSubscriptionCursor,
	): void {
		assert(
			cursorToMove instanceof Cursor,
			0x337 /* ObjectForest must only be given its own Cursor type */,
		);
		assert(
			cursorToMove.forest === this,
			0x338 /* ObjectForest must only be given its own Cursor */,
		);

		const indexStack: number[] = [];
		const keyStack: FieldKey[] = [];

		let path: UpPath | undefined = destination;
		while (path !== undefined) {
			indexStack.push(path.parentIndex);
			keyStack.push(path.parentField);
			path = path.parent;
		}
		cursorToMove.setToAboveDetachedSequences();
		while (keyStack.length > 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			cursorToMove.enterField(keyStack.pop()!);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			cursorToMove.enterNode(indexStack.pop()!);
		}

		return;
	}

	public getCursorAboveDetachedFields(): ITreeCursorSynchronous {
		return cursorForMapTreeNode(this.roots);
	}
}

/**
 * Cursor implementation for ObjectForest.
 */
class Cursor extends SynchronousCursor implements ITreeSubscriptionCursor {
	public state: ITreeSubscriptionCursorState;

	/**
	 * @param forest - forest this cursor navigates
	 * @param innerCursor - underlying cursor implementation this wraps. `undefined` when state is not `Current`
	 */
	public constructor(
		public readonly forest: ObjectForest,
		public readonly source: string | undefined,
		private innerCursor?: CursorWithNode<MutableMapTree>,
	) {
		super();
		if (innerCursor === undefined) {
			this.state = ITreeSubscriptionCursorState.Cleared;
		} else {
			this.state = ITreeSubscriptionCursorState.Current;
			this.forest.currentCursors.add(this);
		}
	}

	public buildFieldAnchor(): FieldAnchor {
		const path = this.getFieldPath();
		const anchor =
			path.parent === undefined ? undefined : this.forest.anchors.track(path.parent);
		return { parent: anchor, fieldKey: path.field };
	}
	public getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		assert(this.innerCursor !== undefined, 0x45f /* Cursor must be current to be used */);
		return this.innerCursor.getFieldPath(prefix);
	}
	public get mode(): CursorLocationType {
		assert(this.innerCursor !== undefined, 0x42e /* Cursor must be current to be used */);
		return this.innerCursor.mode;
	}

	public nextField(): boolean {
		assert(this.innerCursor !== undefined, 0x42f /* Cursor must be current to be used */);
		return this.innerCursor.nextField();
	}
	public exitField(): void {
		assert(this.innerCursor !== undefined, 0x430 /* Cursor must be current to be used */);
		return this.innerCursor.exitField();
	}
	public override skipPendingFields(): boolean {
		assert(this.innerCursor !== undefined, 0x431 /* Cursor must be current to be used */);
		return this.innerCursor.skipPendingFields();
	}
	public getFieldKey(): FieldKey {
		assert(this.innerCursor !== undefined, 0x432 /* Cursor must be current to be used */);
		return this.innerCursor.getFieldKey();
	}
	public getFieldLength(): number {
		assert(this.innerCursor !== undefined, 0x433 /* Cursor must be current to be used */);
		return this.innerCursor.getFieldLength();
	}
	public firstNode(): boolean {
		assert(this.innerCursor !== undefined, 0x434 /* Cursor must be current to be used */);
		return this.innerCursor.firstNode();
	}
	public enterNode(childIndex: number): void {
		assert(this.innerCursor !== undefined, 0x435 /* Cursor must be current to be used */);
		return this.innerCursor.enterNode(childIndex);
	}
	public getPath(prefix?: PathRootPrefix): UpPath {
		assert(this.innerCursor !== undefined, 0x436 /* Cursor must be current to be used */);
		return this.innerCursor.getPath(prefix) ?? fail("no path when at root");
	}
	public get fieldIndex(): number {
		assert(this.innerCursor !== undefined, 0x437 /* Cursor must be current to be used */);
		return this.innerCursor.fieldIndex;
	}
	public get chunkStart(): number {
		assert(this.innerCursor !== undefined, 0x438 /* Cursor must be current to be used */);
		return this.innerCursor.chunkStart;
	}
	public get chunkLength(): number {
		assert(this.innerCursor !== undefined, 0x439 /* Cursor must be current to be used */);
		return this.innerCursor.chunkLength;
	}
	public seekNodes(offset: number): boolean {
		assert(this.innerCursor !== undefined, 0x43a /* Cursor must be current to be used */);
		return this.innerCursor.seekNodes(offset);
	}
	public nextNode(): boolean {
		assert(this.innerCursor !== undefined, 0x43b /* Cursor must be current to be used */);
		return this.innerCursor.nextNode();
	}
	public exitNode(): void {
		assert(this.innerCursor !== undefined, 0x43c /* Cursor must be current to be used */);
		return this.innerCursor.exitNode();
	}
	public firstField(): boolean {
		assert(this.innerCursor !== undefined, 0x43d /* Cursor must be current to be used */);
		return this.innerCursor.firstField();
	}
	public enterField(key: FieldKey): void {
		assert(this.innerCursor !== undefined, 0x43e /* Cursor must be current to be used */);
		return this.innerCursor.enterField(key);
	}
	public get type(): TreeNodeSchemaIdentifier {
		assert(this.innerCursor !== undefined, 0x43f /* Cursor must be current to be used */);
		return this.innerCursor.type;
	}
	public get value(): Value {
		assert(this.innerCursor !== undefined, 0x440 /* Cursor must be current to be used */);
		return this.innerCursor.value;
	}

	// TODO: tests for clear when not at root.
	public clear(): void {
		assert(
			this.state !== ITreeSubscriptionCursorState.Freed,
			0x33b /* Cursor must not be freed */,
		);
		this.state = ITreeSubscriptionCursorState.Cleared;
		this.innerCursor = undefined;
		this.forest.currentCursors.delete(this);
	}

	/**
	 * Move this cursor to the special dummy node above the detached sequences.
	 * Can be used when cleared (but not freed).
	 */
	public setToAboveDetachedSequences(): void {
		assert(
			this.state !== ITreeSubscriptionCursorState.Freed,
			0x33c /* Cursor must not be freed */,
		);
		this.clear();
		this.state = ITreeSubscriptionCursorState.Current;
		// Cast to a cursor of _mutable_ trees to allow direct manipulation of the tree data which is more efficient than doing immutable copies.
		this.innerCursor = cursorForMapTreeNode(
			this.forest.roots,
		) as CursorWithNode<MutableMapTree>;
		this.forest.currentCursors.add(this);
	}

	public getNode(): MutableMapTree {
		assert(this.innerCursor !== undefined, 0x33e /* Cursor must be current to be used */);
		return this.innerCursor.getNode();
	}

	public getParent(): [MutableMapTree, FieldKey] {
		assert(this.innerCursor !== undefined, 0x441 /* Cursor must be current to be used */);
		// This could be optimized to skip moving it accessing internals of cursor.
		const key = this.innerCursor.getFieldKey();
		this.innerCursor.exitField();
		const node = this.innerCursor.getNode();
		this.innerCursor.enterField(key);
		return [node, key];
	}

	public fork(source?: string): ITreeSubscriptionCursor {
		assert(this.innerCursor !== undefined, 0x460 /* Cursor must be current to be used */);
		return new Cursor(this.forest, source ?? `fork: ${this.source}`, this.innerCursor.fork());
	}

	public free(): void {
		assert(
			this.state !== ITreeSubscriptionCursorState.Freed,
			0x33f /* Cursor must not be double freed */,
		);
		this.forest.currentCursors.delete(this);
		this.state = ITreeSubscriptionCursorState.Freed;
	}

	public buildAnchor(): Anchor {
		assert(
			this.state === ITreeSubscriptionCursorState.Current,
			0x37a /* Cursor must be current to be used */,
		);
		return this.forest.anchors.track(this.getPath());
	}
}

// This function is the folder level export for objectForest, and hides all the implementation types.
// When other forest implementations are created (ex: optimized ones),
// this function should likely be moved and updated to (at least conditionally) use them.
/**
 * @returns an implementation of {@link IEditableForest} with no data or schema.
 */
export function buildForest(
	anchors?: AnchorSet,
	additionalAsserts: boolean = false,
): ObjectForest {
	return new ObjectForest(anchors, additionalAsserts);
}
