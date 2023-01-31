/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	recordDependency,
	SimpleDependee,
	SimpleObservingDependent,
	ITreeSubscriptionCursor,
	IEditableForest,
	TreeNavigationResult,
	StoredSchemaRepository,
	FieldKey,
	DetachedField,
	AnchorSet,
	detachedFieldAsKey,
	Value,
	Delta,
	UpPath,
	Anchor,
	visitDelta,
	FieldAnchor,
	ForestEvents,
	ITreeSubscriptionCursorState,
	rootFieldKeySymbol,
} from "../../core";
import { brand, fail, getOrAddEmptyToMap } from "../../util";
import { createEmitter } from "../../events";
import { BasicChunk, BasicChunkCursor, SiblingsOrKey } from "./basicChunk";
import { chunkTree } from "./chunkTree";
import { TreeChunk } from "./chunk";

function makeRoot(): BasicChunk {
	return new BasicChunk(brand("above root placeholder"), new Map());
}

interface StackNode {
	mutableChunk: BasicChunk;
	key: FieldKey;
}

/**
 * Implementation of IEditableForest based on copy on write chunks.
 *
 * This implementation focuses on performance.
 */
class ChunkedForest extends SimpleDependee implements IEditableForest {
	private readonly dependent = new SimpleObservingDependent(() => this.invalidateDependents());

	private readonly events = createEmitter<ForestEvents>();

	public constructor(
		public roots: BasicChunk,
		public readonly schema: StoredSchemaRepository,
		public readonly anchors: AnchorSet = new AnchorSet(),
	) {
		super("object-forest.ChunkedForest");
		// Invalidate forest if schema change.
		recordDependency(this.dependent, this.schema);
	}

	public on<K extends keyof ForestEvents>(eventName: K, listener: ForestEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}

	clone(schema: StoredSchemaRepository, anchors: AnchorSet): ChunkedForest {
		this.roots.referenceAdded();
		return new ChunkedForest(this.roots, schema, anchors);
	}

	public forgetAnchor(anchor: Anchor): void {
		this.anchors.forget(anchor);
	}

	applyDelta(delta: Delta.Root): void {
		this.events.emit("beforeDelta", delta);
		this.invalidateDependents();

		const moves: Map<Delta.MoveId, DetachedField> = new Map();

		if (this.roots.isShared()) {
			this.roots = this.roots.clone();
		}

		// Current location in the tree, as a non-shared BasicChunk (TODO: support in-place modification of other chunk formats when possible).
		// Start above root detached sequences.
		const mutableChunkStack: StackNode[] = [];
		let mutableChunk: BasicChunk | undefined = this.roots;

		const getParent = () => {
			assert(mutableChunkStack.length > 0, 0x532 /* invalid access to root's parent */);
			return mutableChunkStack[mutableChunkStack.length - 1];
		};

		const moveIn = (index: number, toAttach: DetachedField): number => {
			const detachedKey = detachedFieldAsKey(toAttach);
			const children = this.roots.fields.get(detachedKey) ?? [];
			this.roots.fields.delete(detachedKey);
			if (children.length === 0) {
				return 0; // Prevent creating 0 sized fields when inserting empty into empty.
			}

			const parent = getParent();
			const destinationField = getOrAddEmptyToMap(parent.mutableChunk.fields, parent.key);
			// TODO: this will fail for very large moves due to argument limits.
			destinationField.splice(index, 0, ...children);

			return children.length;
		};
		const visitor = {
			onDelete: (index: number, count: number): void => {
				visitor.onMoveOut(index, count);
			},
			onInsert: (index: number, content: Delta.ProtoNode[]): void => {
				const chunks: TreeChunk[] = content.map((c) => chunkTree(c, this.schema));
				const field = this.newDetachedField();
				this.roots.fields.set(detachedFieldAsKey(field), chunks);
				moveIn(index, field);
			},
			onMoveOut: (index: number, count: number, id?: Delta.MoveId): void => {
				const parent = getParent();
				const sourceField = parent.mutableChunk.fields.get(parent.key) ?? [];
				const newField = sourceField.splice(index, count);

				if (id !== undefined) {
					const detached = this.newDetachedField();
					const key = detachedFieldAsKey(detached);
					if (newField.length > 0) {
						this.roots.fields.set(key, newField);
					}
					moves.set(id, detached);
				} else {
					for (const child of newField) {
						child.referenceRemoved();
					}
				}
			},
			onMoveIn: (index: number, count: number, id: Delta.MoveId): void => {
				const toAttach = moves.get(id) ?? fail("move in without move out");
				moves.delete(id);
				const countMoved = moveIn(index, toAttach);
				assert(countMoved === count, 0x533 /* counts must match */);
			},
			onSetValue: (value: Value): void => {
				assert(mutableChunk !== undefined, 0x534 /* should be in node */);
				mutableChunk.value = value;
			},
			enterNode: (index: number): void => {
				assert(mutableChunk === undefined, 0x535 /* should be in field */);
				const parent = getParent();
				const chunks =
					parent.mutableChunk.fields.get(parent.key) ?? fail("missing edited field");
				let indexWithinChunk = index;
				let indexOfChunk = 0;
				while (indexWithinChunk >= chunks[indexOfChunk].topLevelLength) {
					indexWithinChunk -= chunks[indexOfChunk].topLevelLength;
					indexOfChunk++;
					if (indexOfChunk === chunks.length) {
						fail("missing edited node");
					}
				}
				const found = chunks[indexOfChunk];
				assert(
					found instanceof BasicChunk,
					0x536 /* mixed chunk support not yet implemented */,
				);
				if (found.isShared()) {
					mutableChunk = chunks[indexOfChunk] = found.clone();
					found.referenceRemoved();
				} else {
					mutableChunk = found;
				}
			},
			exitNode: (index: number): void => {
				assert(mutableChunk !== undefined, 0x537 /* should be in node */);
				mutableChunk = undefined;
			},
			enterField: (key: FieldKey): void => {
				assert(mutableChunk !== undefined, 0x538 /* should be in node */);
				mutableChunkStack.push({ key, mutableChunk });
				mutableChunk = undefined;
			},
			exitField: (key: FieldKey): void => {
				const top = mutableChunkStack.pop() ?? fail("should not be at root");
				assert(mutableChunk === undefined, 0x539 /* should be in field */);
				mutableChunk = top.mutableChunk;
			},
		};
		visitDelta(delta, visitor);

		this.events.emit("afterDelta", delta);
	}

	private nextDetachedFieldIdentifier = 0;
	public newDetachedField(): DetachedField {
		const field: DetachedField = brand(String(this.nextDetachedFieldIdentifier));
		assert(
			!this.roots.fields.has(detachedFieldAsKey(field)),
			0x53a /* new field must not already exist */,
		);
		this.nextDetachedFieldIdentifier += 1;
		return field;
	}

	public allocateCursor(): Cursor {
		return new Cursor(
			this,
			ITreeSubscriptionCursorState.Cleared,
			[],
			[],
			[],
			[],
			[],
			[],
			0,
			0,
			0,
		);
	}

	tryMoveCursorToNode(
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

	tryMoveCursorToField(
		destination: FieldAnchor,
		cursorToMove: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		assert(
			cursorToMove instanceof Cursor,
			0x53b /* ChunkedForest must only be given its own Cursor type */,
		);
		if (destination.parent === undefined) {
			cursorToMove.setToDetachedSequence(destination.fieldKey);
			return TreeNavigationResult.Ok;
		}
		const result = this.tryMoveCursorToNode(destination.parent, cursorToMove);
		if (result !== TreeNavigationResult.Ok) {
			return result;
		}

		cursorToMove.enterField(destination.fieldKey);
		return TreeNavigationResult.Ok;
	}

	/**
	 * Set `cursorToMove` to location described by path.
	 * This is NOT a relative move: current position is discarded.
	 * Path must point to existing node.
	 */
	moveCursorToPath(destination: UpPath | undefined, cursorToMove: ITreeSubscriptionCursor): void {
		assert(
			cursorToMove instanceof Cursor,
			0x53c /* ChunkedForest must only be given its own Cursor type */,
		);
		assert(
			cursorToMove.forest === this,
			0x53d /* ChunkedForest must only be given its own Cursor */,
		);

		const indexStack: number[] = [];
		const keyStack: FieldKey[] = [];

		let path: UpPath | undefined = destination;
		while (path !== undefined) {
			indexStack.push(path.parentIndex);
			keyStack.push(path.parentField);
			path = path.parent;
		}
		cursorToMove.clear();
		while (keyStack.length > 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const key = keyStack.pop()!;
			if (cursorToMove.state === ITreeSubscriptionCursorState.Cleared) {
				cursorToMove.setToDetachedSequence(key);
				cursorToMove.state = ITreeSubscriptionCursorState.Current;
			} else {
				cursorToMove.enterField(key);
			}

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			cursorToMove.enterNode(indexStack.pop()!);
		}
	}
}

class Cursor extends BasicChunkCursor implements ITreeSubscriptionCursor {
	public constructor(
		public readonly forest: ChunkedForest,
		public state: ITreeSubscriptionCursorState,
		root: BasicChunk[],
		siblingStack: SiblingsOrKey[],
		indexStack: number[],
		indexOfChunkStack: number[],
		indexWithinChunkStack: number[],
		siblings: SiblingsOrKey,
		index: number,
		indexOfChunk: number,
		indexWithinChunk: number,
	) {
		super(
			root,
			siblingStack,
			indexStack,
			indexOfChunkStack,
			indexWithinChunkStack,
			siblings,
			index,
			indexOfChunk,
			indexWithinChunk,
		);
	}

	public setToDetachedSequence(key: FieldKey): void {
		this.root = (this.forest.roots.fields.get(key) ?? []) as BasicChunk[];
		this.siblingStack.length = 0;
		this.indexStack.length = 0;
		this.indexOfChunkStack.length = 0;
		this.indexWithinChunkStack.length = 0;
		this.siblings = [key];
		this.index = 0;
		this.indexOfChunk = 0;
		this.indexWithinChunk = 0;
	}

	public fork(): Cursor {
		// Siblings arrays are not modified during navigation and do not need be be copied.
		// This allows this copy to be shallow, and `this.siblings` below to not be copied as all.
		return new Cursor(
			this.forest,
			this.state,
			this.root,
			[...this.siblingStack],
			[...this.indexStack],
			[...this.indexOfChunkStack],
			[...this.indexWithinChunkStack],
			this.siblings,
			this.index,
			this.indexOfChunk,
			this.indexWithinChunk,
		);
	}

	public buildFieldAnchor(): FieldAnchor {
		const path = this.getFieldPath();
		const anchor =
			path.parent === undefined ? undefined : this.forest.anchors.track(path.parent);
		return { parent: anchor, fieldKey: path.field };
	}

	public free(): void {
		this.state = ITreeSubscriptionCursorState.Freed;
	}

	public buildAnchor(): Anchor {
		return this.forest.anchors.track(this.getPath());
	}

	public clear(): void {
		this.state = ITreeSubscriptionCursorState.Cleared;
		this.setToDetachedSequence(rootFieldKeySymbol);
	}
}

/**
 * @returns an implementation of {@link IEditableForest} with no data or schema.
 */
export function buildChunkedForest(
	schema: StoredSchemaRepository,
	anchors?: AnchorSet,
): IEditableForest {
	return new ChunkedForest(makeRoot(), schema, anchors);
}
