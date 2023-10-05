/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
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
	Delta,
	UpPath,
	Anchor,
	FieldAnchor,
	ForestEvents,
	ITreeSubscriptionCursorState,
	rootFieldKey,
	mapCursorField,
	DeltaVisitor,
} from "../../core";
import { brand, fail, getOrAddEmptyToMap } from "../../util";
import { createEmitter } from "../../events";
import { BasicChunk, BasicChunkCursor, SiblingsOrKey } from "./basicChunk";
import { basicChunkTree, chunkTree, IChunker } from "./chunkTree";
import { ChunkedCursor, TreeChunk } from "./chunk";

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

	private activeVisitor?: DeltaVisitor;

	private readonly events = createEmitter<ForestEvents>();

	/**
	 * @param roots - dummy node above the root under which detached fields are stored. All content of the forest is reachable from this.
	 * @param schema - schema which all content in this forest is assumed to comply with.
	 * @param chunker - Chunking policy. TODO: dispose of this when forest is disposed.
	 * @param anchors - anchorSet used to track location in this forest across changes. Callers of applyDelta must ensure this is updated accordingly.
	 */
	public constructor(
		public roots: BasicChunk,
		public readonly schema: StoredSchemaRepository,
		public readonly chunker: IChunker,
		public readonly anchors: AnchorSet = new AnchorSet(),
	) {
		super("object-forest.ChunkedForest");
	}

	public get isEmpty(): boolean {
		return this.roots.fields.size === 0;
	}

	public on<K extends keyof ForestEvents>(eventName: K, listener: ForestEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}

	public clone(schema: StoredSchemaRepository, anchors: AnchorSet): ChunkedForest {
		this.roots.referenceAdded();
		return new ChunkedForest(this.roots, schema, this.chunker.clone(schema), anchors);
	}

	public forgetAnchor(anchor: Anchor): void {
		this.anchors.forget(anchor);
	}

	public acquireVisitor(): DeltaVisitor {
		assert(
			this.activeVisitor === undefined,
			0x76a /* Must release existing visitor before acquiring another */,
		);
		this.events.emit("beforeChange");

		const moves: Map<Delta.MoveId, DetachedField> = new Map();

		if (this.roots.isShared()) {
			this.roots = this.roots.clone();
		}

		const visitor = {
			forest: this,
			// Current location in the tree, as a non-shared BasicChunk (TODO: support in-place modification of other chunk formats when possible).
			// Start above root detached sequences.
			mutableChunkStack: [] as StackNode[],
			mutableChunk: this.roots as BasicChunk | undefined,
			getParent() {
				assert(
					this.mutableChunkStack.length > 0,
					0x532 /* invalid access to root's parent */,
				);
				return this.mutableChunkStack[this.mutableChunkStack.length - 1];
			},
			moveIn(
				index: number,
				toAttach: DetachedField,
				invalidateDependents: boolean = true,
			): number {
				if (invalidateDependents) {
					this.forest.invalidateDependents();
				}
				const detachedKey = detachedFieldAsKey(toAttach);
				const children = this.forest.roots.fields.get(detachedKey) ?? [];
				this.forest.roots.fields.delete(detachedKey);
				if (children.length === 0) {
					return 0; // Prevent creating 0 sized fields when inserting empty into empty.
				}

				const parent = this.getParent();
				const destinationField = getOrAddEmptyToMap(parent.mutableChunk.fields, parent.key);
				// TODO: this will fail for very large moves due to argument limits.
				destinationField.splice(index, 0, ...children);

				return children.length;
			},
			free(): void {
				this.mutableChunk = undefined;
				this.mutableChunkStack.length = 0;
				assert(
					this.forest.activeVisitor !== undefined,
					0x76b /* Multiple free calls for same visitor */,
				);
				this.forest.activeVisitor = undefined;
				this.forest.events.emit("afterChange");
			},
			onDelete(index: number, count: number): void {
				this.onMoveOut(index, count);
			},
			onInsert(index: number, content: Delta.ProtoNodes): void {
				this.forest.invalidateDependents();
				const chunks: TreeChunk[] = content.map((c) => chunkTree(c, this.forest.chunker));
				const field = this.forest.newDetachedField();
				this.forest.roots.fields.set(detachedFieldAsKey(field), chunks);
				this.moveIn(index, field, false);
			},
			onMoveOut(index: number, count: number, id?: Delta.MoveId): void {
				this.forest.invalidateDependents();
				const parent = this.getParent();
				const sourceField = parent.mutableChunk.fields.get(parent.key) ?? [];
				const newField = sourceField.splice(index, count);

				if (id !== undefined) {
					const detached = this.forest.newDetachedField();
					const key = detachedFieldAsKey(detached);
					if (newField.length > 0) {
						this.forest.roots.fields.set(key, newField);
					}
					moves.set(id, detached);
				} else {
					for (const child of newField) {
						child.referenceRemoved();
					}
				}
				if (sourceField.length === 0) {
					parent.mutableChunk.fields.delete(parent.key);
				}
			},
			onMoveIn(index: number, count: number, id: Delta.MoveId): void {
				const toAttach = moves.get(id) ?? fail("move in without move out");
				moves.delete(id);
				const countMoved = this.moveIn(index, toAttach);
				assert(countMoved === count, 0x533 /* counts must match */);
			},
			enterNode(index: number): void {
				assert(this.mutableChunk === undefined, 0x535 /* should be in field */);
				const parent = this.getParent();
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
				let found = chunks[indexOfChunk];
				if (!(found instanceof BasicChunk)) {
					// TODO:Perf: support in place editing of other chunk formats when possible:
					// 1. Support updating values in uniform chunks.
					// 2. Support traversing sequence chunks.
					//
					// Maybe build path when visitor navigates then lazily sync to chunk tree when editing?
					const newChunks = mapCursorField(found.cursor(), (cursor) =>
						basicChunkTree(cursor, this.forest.chunker),
					);
					// TODO: this could fail for really long chunks being split (due to argument count limits).
					// Current implementations of chunks shouldn't ever be that long, but it could be an issue if they get bigger.
					chunks.splice(indexOfChunk, 1, ...newChunks);
					found.referenceRemoved();

					found = newChunks[indexWithinChunk];
				}
				assert(found instanceof BasicChunk, 0x536 /* chunk should have been normalized */);
				if (found.isShared()) {
					this.mutableChunk = chunks[indexOfChunk] = found.clone();
					found.referenceRemoved();
				} else {
					this.mutableChunk = found;
				}
			},
			exitNode(index: number): void {
				assert(this.mutableChunk !== undefined, 0x537 /* should be in node */);
				this.mutableChunk = undefined;
			},
			enterField(key: FieldKey): void {
				assert(this.mutableChunk !== undefined, 0x538 /* should be in node */);
				this.mutableChunkStack.push({ key, mutableChunk: this.mutableChunk });
				this.mutableChunk = undefined;
			},
			exitField(key: FieldKey): void {
				const top = this.mutableChunkStack.pop() ?? fail("should not be at root");
				assert(this.mutableChunk === undefined, 0x539 /* should be in field */);
				this.mutableChunk = top.mutableChunk;
			},
		};
		this.activeVisitor = visitor;
		return visitor;
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
			undefined,
		);
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

	public moveCursorToPath(
		destination: UpPath | undefined,
		cursorToMove: ITreeSubscriptionCursor,
	): void {
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
		root: readonly TreeChunk[],
		siblingStack: SiblingsOrKey[],
		indexStack: number[],
		indexOfChunkStack: number[],
		indexWithinChunkStack: number[],
		siblings: SiblingsOrKey,
		index: number,
		indexOfChunk: number,
		indexWithinChunk: number,
		nestedCursor: ChunkedCursor | undefined,
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
			nestedCursor,
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
		this.nestedCursor = undefined;
	}

	public override fork(): Cursor {
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
			this.nestedCursor?.fork(),
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
		this.setToDetachedSequence(rootFieldKey);
	}
}

/**
 * @returns an implementation of {@link IEditableForest} with no data or schema.
 */
export function buildChunkedForest(chunker: IChunker, anchors?: AnchorSet): IEditableForest {
	return new ChunkedForest(makeRoot(), chunker.schema, chunker, anchors);
}
