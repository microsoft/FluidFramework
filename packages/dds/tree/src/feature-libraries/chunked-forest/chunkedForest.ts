/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import type { Listenable } from "@fluidframework/core-interfaces";
import { createEmitter } from "@fluid-internal/client-utils";

import {
	type Anchor,
	AnchorSet,
	type AnnouncedVisitor,
	type DeltaVisitor,
	type DetachedField,
	type FieldAnchor,
	type FieldKey,
	type ForestEvents,
	type IEditableForest,
	type ITreeCursorSynchronous,
	type ITreeSubscriptionCursor,
	ITreeSubscriptionCursorState,
	type PlaceIndex,
	type Range,
	TreeNavigationResult,
	type TreeStoredSchemaSubscription,
	type UpPath,
	aboveRootPlaceholder,
	combineVisitors,
	detachedFieldAsKey,
	mapCursorField,
	rootFieldKey,
	type ChunkedCursor,
	type TreeChunk,
} from "../../core/index.js";
import {
	assertValidRange,
	brand,
	fail,
	getLast,
	getOrAddEmptyToMap,
	hasSome,
} from "../../util/index.js";

import { BasicChunk, BasicChunkCursor, type SiblingsOrKey } from "./basicChunk.js";
import { type IChunker, basicChunkTree, chunkTree } from "./chunkTree.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";

function makeRoot(): BasicChunk {
	return new BasicChunk(aboveRootPlaceholder, new Map());
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
export class ChunkedForest implements IEditableForest {
	private activeVisitor?: DeltaVisitor;

	private readonly deltaVisitors: Set<() => AnnouncedVisitor> = new Set();
	readonly #events = createEmitter<ForestEvents>();
	public readonly events: Listenable<ForestEvents> = this.#events;

	/**
	 * @param roots - dummy node above the root under which detached fields are stored. All content of the forest is reachable from this.
	 * @param schema - schema which all content in this forest is assumed to comply with.
	 * @param chunker - Chunking policy. TODO: dispose of this when forest is disposed.
	 * @param anchors - anchorSet used to track location in this forest across changes. Callers of applyDelta must ensure this is updated accordingly.
	 */
	public constructor(
		public roots: BasicChunk,
		public readonly schema: TreeStoredSchemaSubscription,
		public readonly chunker: IChunker,
		public readonly anchors: AnchorSet = new AnchorSet(),
		public readonly idCompressor?: IIdCompressor,
	) {}

	public get isEmpty(): boolean {
		return this.roots.fields.size === 0;
	}

	public clone(schema: TreeStoredSchemaSubscription, anchors: AnchorSet): ChunkedForest {
		this.roots.referenceAdded();
		return new ChunkedForest(this.roots, schema, this.chunker.clone(schema), anchors);
	}

	public forgetAnchor(anchor: Anchor): void {
		this.anchors.forget(anchor);
	}

	public registerAnnouncedVisitor(visitor: () => AnnouncedVisitor): void {
		this.deltaVisitors.add(visitor);
	}

	public deregisterAnnouncedVisitor(visitor: () => AnnouncedVisitor): void {
		this.deltaVisitors.delete(visitor);
	}

	public acquireVisitor(): DeltaVisitor {
		assert(
			this.activeVisitor === undefined,
			0x76a /* Must release existing visitor before acquiring another */,
		);

		if (this.roots.isShared()) {
			this.roots = this.roots.clone();
		}

		const forestVisitor = {
			forest: this,
			// Current location in the tree, as a non-shared BasicChunk (TODO: support in-place modification of other chunk formats when possible).
			// Start above root detached sequences.
			mutableChunkStack: [] as StackNode[],
			mutableChunk: this.roots as BasicChunk | undefined,
			getParent(): StackNode {
				assert(hasSome(this.mutableChunkStack), 0x532 /* invalid access to root's parent */);
				return getLast(this.mutableChunkStack);
			},
			free(): void {
				this.mutableChunk = undefined;
				this.mutableChunkStack.length = 0;
				assert(
					this.forest.activeVisitor !== undefined,
					0x76b /* Multiple free calls for same visitor */,
				);
				this.forest.activeVisitor = undefined;
			},
			destroy(detachedField: FieldKey, count: number): void {
				this.forest.#events.emit("beforeChange");
				this.forest.roots.fields.delete(detachedField);
			},
			create(content: ITreeCursorSynchronous[], destination: FieldKey): void {
				this.forest.#events.emit("beforeChange");
				const chunks: TreeChunk[] = content.map((c) =>
					chunkTree(c, {
						policy: this.forest.chunker,
						idCompressor: this.forest.idCompressor,
					}),
				);
				this.forest.roots.fields.set(destination, chunks);
				this.forest.#events.emit("afterRootFieldCreated", destination);
			},
			attach(source: FieldKey, count: number, destination: PlaceIndex): void {
				this.attachEdit(source, count, destination);
			},
			detach(source: Range, destination: FieldKey): void {
				this.detachEdit(source, destination);
			},
			/**
			 * Attaches the range into the current field by transferring it from the given source path.
			 * Does not invalidate dependents.
			 * @param source - The the range to be attached.
			 * @param destination - The index in the current field at which to attach the content.
			 */
			attachEdit(source: FieldKey, count: number, destination: PlaceIndex): void {
				this.forest.#events.emit("beforeChange");
				const sourceField = this.forest.roots.fields.get(source) ?? [];
				this.forest.roots.fields.delete(source);
				if (sourceField.length === 0) {
					return; // Prevent creating 0 sized fields when inserting empty into empty.
				}

				const parent = this.getParent();
				const destinationField = getOrAddEmptyToMap(parent.mutableChunk.fields, parent.key);
				// TODO: this will fail for very large moves due to argument limits.
				destinationField.splice(destination, 0, ...sourceField);
			},
			/**
			 * Detaches the range from the current field and transfers it to the given destination if any.
			 * Does not invalidate dependents.
			 * @param source - The bounds of the range to be detached from the current field.
			 * @param destination - If specified, the destination to transfer the detached range to.
			 * If not specified, the detached range is destroyed.
			 */
			detachEdit(source: Range, destination: FieldKey | undefined): void {
				this.forest.#events.emit("beforeChange");
				const parent = this.getParent();
				const sourceField = parent.mutableChunk.fields.get(parent.key) ?? [];

				assertValidRange(source, sourceField);
				const newField = sourceField.splice(source.start, source.end - source.start);

				if (destination !== undefined) {
					assert(
						!this.forest.roots.fields.has(destination),
						0x7af /* Destination must be a new empty detached field */,
					);
					if (newField.length > 0) {
						this.forest.roots.fields.set(destination, newField);
					}
				} else {
					for (const child of newField) {
						child.referenceRemoved();
					}
				}
				// This check is performed after the transfer to ensure that the field is not removed in scenarios
				// where the source and destination are the same.
				if (sourceField.length === 0) {
					parent.mutableChunk.fields.delete(parent.key);
				}
			},
			replace(
				newContentSource: FieldKey,
				range: Range,
				oldContentDestination: FieldKey,
			): void {
				assert(
					newContentSource !== oldContentDestination,
					0x7b0 /* Replace detached source field and detached destination field must be different */,
				);
				// TODO: optimize this to: perform in-place replace in uniform chunks when possible.
				// This should result in 3 cases:
				// 1. In-place update of uniform chunk. No allocations, no ref count changes, no new TreeChunks.
				// 2. Uniform chunk is shared: copy it (and parent path as needed), and update the copy.
				// 3. Fallback to detach then attach (Which will copy parents and convert to basic chunks as needed).
				this.detachEdit(range, oldContentDestination);
				this.attachEdit(newContentSource, range.end - range.start, range.start);
			},
			enterNode(index: number): void {
				assert(this.mutableChunk === undefined, 0x535 /* should be in field */);
				const parent = this.getParent();
				const chunks =
					parent.mutableChunk.fields.get(parent.key) ?? fail(0xaf6 /* missing edited field */);
				let indexWithinChunk = index;
				let indexOfChunk = 0;
				let chunk = chunks[indexOfChunk] ?? oob();
				while (indexWithinChunk >= chunk.topLevelLength) {
					chunk = chunks[indexOfChunk] ?? oob();
					indexWithinChunk -= chunk.topLevelLength;
					indexOfChunk++;
					if (indexOfChunk === chunks.length) {
						fail(0xaf7 /* missing edited node */);
					}
				}
				let found = chunks[indexOfChunk] ?? oob();
				if (!(found instanceof BasicChunk)) {
					// TODO:Perf: support in place editing of other chunk formats when possible:
					// 1. Support updating values in uniform chunks.
					// 2. Support traversing sequence chunks.
					//
					// Maybe build path when visitor navigates then lazily sync to chunk tree when editing?
					const newChunks = mapCursorField(found.cursor(), (cursor) =>
						basicChunkTree(cursor, {
							policy: this.forest.chunker,
							idCompressor: this.forest.idCompressor,
						}),
					);
					// TODO: this could fail for really long chunks being split (due to argument count limits).
					// Current implementations of chunks shouldn't ever be that long, but it could be an issue if they get bigger.
					chunks.splice(indexOfChunk, 1, ...newChunks);
					found.referenceRemoved();

					found = newChunks[indexWithinChunk] ?? oob();
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
				const top = this.mutableChunkStack.pop() ?? fail(0xaf8 /* should not be at root */);
				assert(this.mutableChunk === undefined, 0x539 /* should be in field */);
				this.mutableChunk = top.mutableChunk;
			},
		};

		const announcedVisitors: AnnouncedVisitor[] = [];
		this.deltaVisitors.forEach((getVisitor) => announcedVisitors.push(getVisitor()));
		const combinedVisitor = combineVisitors(
			[forestVisitor, ...announcedVisitors],
			announcedVisitors,
		);
		this.activeVisitor = combinedVisitor;
		return combinedVisitor;
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

	public moveCursorToPath(destination: UpPath, cursorToMove: ITreeSubscriptionCursor): void {
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

	public getCursorAboveDetachedFields(): ITreeCursorSynchronous {
		const rootCursor = this.roots.cursor();
		rootCursor.enterNode(0);
		return rootCursor;
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
export function buildChunkedForest(
	chunker: IChunker,
	anchors?: AnchorSet,
	idCompressor?: IIdCompressor,
): ChunkedForest {
	return new ChunkedForest(makeRoot(), chunker.schema, chunker, anchors, idCompressor);
}
