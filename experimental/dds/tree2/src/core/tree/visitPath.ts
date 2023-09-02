/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AttachedRangeUpPath, DetachedRangeUpPath } from "./pathTree";

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
		oldContent: AttachedRangeUpPath,
		newContent: DetachedRangeUpPath,
		kind: ReplaceKind,
	): void;

	/**
	 * Invoked after the replacement of a range of nodes.
	 * @param oldContent - The content that was detached.
	 * @param newContent - The content that was attached.
	 * @param kind - The kind of replacement that occurred.
	 */
	afterReplace(
		oldContent: DetachedRangeUpPath,
		newContent: AttachedRangeUpPath,
		kind: ReplaceKind,
	): void;

	/**
	 * Invoked before content is destroyed.
	 * @param content - The content that will be destroyed
	 */
	beforeDestroy(content: DetachedRangeUpPath): void;
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
