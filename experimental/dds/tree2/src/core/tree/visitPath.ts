/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AttachedRangeUpPath, DetachedRangeUpPath, UpPath } from "./pathTree";
import * as Delta from "./delta";

/**
 * Delta visitor for the path tree.
 *
 * For any of these events, the paths are guaranteed to be valid at the time of the event,
 * and it is valid to read from the Forest at that path.
 *
 * @alpha
 */
export interface PathVisitor {
	/**
	 * Invoked after the creation of a range of nodes.
	 * @param content - The content that was created.
	 */
	afterCreate(content: DetachedRangeUpPath): void;

	/**
	 * Invoked before the replacement of a range of nodes.
	 * @param oldContent - The content that will be detached.
	 * @param newContent - The content that will be attached.
	 * @param kind - The kind of replacement that will occur.
	 */
	beforeReplace(
		oldContent: AttachedRangeUpPath | undefined,
		newContent: DetachedRangeUpPath | undefined,
		kind: ReplaceKind,
	): void;

	/**
	 * Invoked after the replacement of a range of nodes.
	 * @param oldContent - The content that was detached.
	 * @param newContent - The content that was attached.
	 * @param kind - The kind of replacement that occurred.
	 */
	afterReplace(
		oldContent: DetachedRangeUpPath | undefined,
		newContent: AttachedRangeUpPath | undefined,
		kind: ReplaceKind,
	): void;

	/**
	 * Invoked before content is destroyed.
	 * @param content - The content that will be destroyed
	 */
	beforeDestroy(content: DetachedRangeUpPath): void;

	/**
	 * A sequence of nodes of length `count` is being deleted starting with `path`.
	 * Called when these nodes are no longer parented under their previous parent, and do not have a new parent.
	 * It is possible they may be un-deleted in the future (for example by a conflicted merge or undo).
	 *
	 * Not called for children of deleted nodes.
	 *
	 * @param path - first node in the deleted range.
	 * @param count - length of deleted range.
	 *
	 * @deprecated Migrate to `beforeDestroy`, `beforeReplace` and/or `afterReplace` instead.
	 */
	onDelete(path: UpPath, count: number): void;
	/**
	 * @param path - location which first node of inserted range will have after insert.
	 * Any nodes at this index (or after it) will be moved to the right (have their indexes increased by `content.length`).
	 * @param content - content which is being inserted.
	 *
	 * @deprecated Migrate to `afterCreate`, `beforeReplace` and/or `afterReplace` instead.
	 */
	onInsert(path: UpPath, content: Delta.ProtoNodes): void;
}

/**
 * Describes the specific nature of a replacement.
 * @alpha
 */
export enum ReplaceKind {
	/**
	 * The new content will truly be at the same location as the old content.
	 * When that's the case, if user 1 replaces nodes ABC with nodes DEF,
	 * while user 2 concurrently inserts node X and Y such that they locally see AXBYC,
	 * the result is guaranteed to be DXEYF.
	 * This is also true if the inserts of X and Y are performed concurrently by two separate users.
	 */
	CellPerfect,
	/**
	 * The new content will at location that, so long as concurrent edits are not taken into account,
	 * is indistinguishable from that of the old content.
	 * When that's the case, if user 1 replaces nodes ABC with nodes DEF,
	 * while user 2 concurrently inserts node X and Y such that they locally see AXBYC,
	 * the result may be any of the following (depending on tie-breaking flags):
	 * - XYDEF
	 * - XDEFY
	 * - DEFXY
	 * If the inserts of X and Y are performed concurrently by two separate users,
	 * then the result may be any of the following (depending on tie-breaking flags and sequence ordering):
	 * - XYDEF (as above)
	 * - YXDEF (new)
	 * - XDEFY (as above)
	 * - YDEFX (new)
	 * - DEFXY (as above)
	 * - DEFYX (new)
	 */
	SpliceLike,
}
