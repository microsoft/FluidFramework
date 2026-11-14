/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

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
	makeBreakingVisitor,
	rootFieldKey,
	type TreeChunk,
	type DeltaDetachedNodeId,
} from "../../core/index.js";
import { brand, Breakable, type WithBreakable } from "../../util/index.js";

import { BasicChunk } from "./basicChunk.js";
import { ChunkCursor, ChunkSequenceCursor } from "./chunkCursor.js";
import { ChunkEditTraversal } from "./chunkEditTraversal.js";
import { getFieldLength } from "./chunkEditing.js";
import { type IChunker, chunkField, chunkTree } from "./chunkTree.js";

export { ensureExclusiveBasicChunk } from "./chunkEditTraversal.js";
export { locateNodeInChunks } from "./chunkEditing.js";

function makeRoot(): BasicChunk {
	return new BasicChunk(aboveRootPlaceholder, new Map());
}

/**
 * Implementation of IEditableForest based on copy on write chunks.
 *
 * This implementation focuses on performance.
 */
export class ChunkedForest implements IEditableForest, WithBreakable {
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
		public readonly breaker: Breakable = new Breakable("ChunkedForest"),
	) {}

	public get isEmpty(): boolean {
		this.breaker.use();
		return this.roots.fields.size === 0;
	}

	public clone(schema: TreeStoredSchemaSubscription, breaker?: Breakable): ChunkedForest {
		this.breaker.use();
		this.roots.referenceAdded();
		return new ChunkedForest(
			this.roots,
			schema,
			this.chunker.clone(schema),
			undefined,
			this.idCompressor,
			breaker ?? this.breaker,
		);
	}

	public chunkField(
		cursor: ITreeCursorSynchronous,
		shouldRechunk?: (chunk: TreeChunk) => boolean,
	): TreeChunk[] {
		this.breaker.use();
		return chunkField(cursor, {
			idCompressor: this.idCompressor,
			policy: this.chunker,
			...(shouldRechunk === undefined ? {} : { shouldRechunk }),
		});
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
		this.breaker.use();
		assert(
			this.activeVisitor === undefined,
			0x76a /* Must release existing visitor before acquiring another */,
		);

		if (this.roots.isShared()) {
			const oldRoots = this.roots;
			this.roots = oldRoots.clone();
			oldRoots.referenceRemoved();
		}

		const editor = new ChunkEditTraversal(this.roots, {
			policy: this.chunker,
			idCompressor: this.idCompressor,
		});
		const forestVisitor = {
			forest: this,
			free(): void {
				editor.free();
				assert(
					this.forest.activeVisitor !== undefined,
					0x76b /* Multiple free calls for same visitor */,
				);
				this.forest.activeVisitor = undefined;
			},
			destroy(detachedField: FieldKey, count: number): void {
				this.forest.#events.emit("beforeChange");
				const field = this.forest.roots.fields.get(detachedField);
				assert(field !== undefined, 0xd1d /* Destroyed field must exist */);
				assert(
					getFieldLength(field) === count,
					0xd1e /* Destroy count must match field length */,
				);
				this.forest.roots.fields.delete(detachedField);
				for (const chunk of field) {
					chunk.referenceRemoved();
				}
			},
			create(content: readonly ITreeCursorSynchronous[], destination: FieldKey): void {
				this.forest.#events.emit("beforeChange");
				assert(
					!this.forest.roots.fields.has(destination),
					0xd1f /* Create destination must be a new empty field */,
				);
				const chunks: TreeChunk[] = content.map((c) =>
					chunkTree(c, {
						policy: this.forest.chunker,
						idCompressor: this.forest.idCompressor,
						shouldRechunk: () => true,
					}),
				);
				this.forest.roots.fields.set(destination, chunks);
				this.forest.#events.emit("afterRootFieldCreated", destination);
			},
			attach(source: FieldKey, count: number, destination: PlaceIndex): void {
				this.forest.#events.emit("beforeChange");
				this.attachEdit(source, count, destination);
			},
			detach(source: Range, destination: FieldKey, id: DeltaDetachedNodeId): void {
				this.forest.#events.emit("beforeChange");
				this.detachEdit(source, destination);
			},
			replace(
				source: FieldKey,
				range: Range,
				destination: FieldKey,
				id: DeltaDetachedNodeId,
			): void {
				this.forest.#events.emit("beforeChange");
				assert(source !== destination, "Replacement source and destination must differ");
				assert(
					!editor.isRootField(source),
					"Replacement source must differ from current field",
				);
				assert(
					!editor.isRootField(destination),
					"Replacement destination must differ from current field",
				);
				assert(
					!this.forest.roots.fields.has(destination),
					"Replacement destination must be new",
				);
				const content = this.forest.roots.fields.get(source);
				assert(content !== undefined, "Replacement source must exist");
				assert(
					getFieldLength(content) === range.end - range.start,
					"Replacement lengths must match",
				);
				const removed = editor.splice(range, content);
				this.forest.roots.fields.delete(source);
				if (removed.length > 0) {
					this.forest.roots.fields.set(destination, removed);
				}
			},
			/**
			 * Attaches the range into the current field by transferring it from the given source path.
			 * Does not invalidate dependents.
			 * @param source - The the range to be attached.
			 * @param destination - The index in the current field at which to attach the content.
			 */
			attachEdit(source: FieldKey, count: number, destination: PlaceIndex): void {
				assert(
					!editor.isRootField(source),
					0xd20 /* Attach source field must be different from current field */,
				);
				const sourceField = this.forest.roots.fields.get(source);
				assert(sourceField !== undefined, 0xd21 /* Attach source field must exist */);
				assert(
					getFieldLength(sourceField) === count,
					0xd22 /* Attach must consume all nodes in source field */,
				);
				assert(
					destination <= editor.getFieldLength(),
					0xd23 /* Attach destination must not exceed field length */,
				);
				editor.splice({ start: destination, end: destination }, sourceField);
				this.forest.roots.fields.delete(source);
			},
			/**
			 * Detaches the range from the current field and transfers it to the given destination if any.
			 * Does not invalidate dependents.
			 * @param source - The bounds of the range to be detached from the current field.
			 * @param destination - If specified, the destination to transfer the detached range to.
			 * If not specified, the detached range is destroyed.
			 */
			detachEdit(source: Range, destination: FieldKey | undefined): void {
				assert(source.start <= source.end, 0xd24 /* Detach range start must not exceed end */);
				assert(
					source.end <= editor.getFieldLength(),
					0xd25 /* Detach range must not exceed field length */,
				);
				if (destination !== undefined) {
					assert(
						!editor.isRootField(destination),
						0xd26 /* Detach destination field must be different from current field */,
					);
					assert(
						!this.forest.roots.fields.has(destination),
						0xd27 /* Detach destination must be a new empty field */,
					);
				}

				const newField = editor.splice(source, []);
				if (destination === undefined) {
					for (const child of newField) {
						child.referenceRemoved();
					}
				} else {
					if (newField.length > 0) {
						this.forest.roots.fields.set(destination, newField);
					}
				}
			},
			enterNode(index: number): void {
				editor.enterNode(index);
			},
			exitNode(index: number): void {
				editor.exitNode();
			},
			enterField(key: FieldKey): void {
				editor.enterField(key);
			},
			exitField(key: FieldKey): void {
				editor.exitField();
			},
		};

		const announcedVisitors: AnnouncedVisitor[] = [];
		for (const getVisitor of this.deltaVisitors) {
			announcedVisitors.push(getVisitor());
		}
		const visitor = combineVisitors([
			makeBreakingVisitor(forestVisitor, this.breaker),
			...announcedVisitors,
		]);
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
		this.breaker.use();
		return new Cursor(this, ITreeSubscriptionCursorState.Cleared);
	}

	public tryMoveCursorToNode(
		destination: Anchor,
		cursorToMove: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		this.breaker.use();
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
		this.breaker.use();
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
		this.breaker.use();
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
		this.breaker.use();
		const rootCursor = this.roots.cursor();
		rootCursor.enterNode(0);
		return rootCursor;
	}
}

class Cursor extends ChunkCursor implements ITreeSubscriptionCursor {
	public constructor(
		public readonly forest: ChunkedForest,
		public state: ITreeSubscriptionCursorState,
	) {
		super(new ChunkSequenceCursor([]));
	}

	public setToDetachedSequence(key: FieldKey): void {
		this.reset(new ChunkSequenceCursor(this.forest.roots.fields.get(key) ?? [], key));
	}

	public override fork(): Cursor {
		const cursor = new Cursor(this.forest, this.state);
		this.copyTo(cursor);
		return cursor;
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
 * Creates an implementation of {@link IEditableForest} with no data or schema.
 */
export function buildChunkedForest(
	chunker: IChunker,
	anchors?: AnchorSet,
	idCompressor?: IIdCompressor,
	breaker?: Breakable,
): ChunkedForest {
	return new ChunkedForest(
		makeRoot(),
		chunker.schema,
		chunker,
		anchors,
		idCompressor,
		breaker,
	);
}
