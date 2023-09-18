/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Delta from "./delta";
import { UpPath } from "./pathTree";

/**
 * Delta visitor for the path tree.
 *
 * TODO: additional callbacks
 * @public
 */
export interface PathVisitor {
	/**
	 * A sequence of nodes of length `count` is being deleted starting with `path`.
	 * Called when these nodes are no longer parented under their previous parent, and do not have a new parent.
	 * It is possible they may be un-deleted in the future (for example by a conflicted merge or undo).
	 *
	 * Not called for children of deleted nodes.
	 *
	 * @param path - first node in the deleted range.
	 * @param count - length of deleted range.
	 */
	onDelete(path: UpPath, count: number): void;
	/**
	 * @param path - location which first node of inserted range will have after insert.
	 * Any nodes at this index (or after it) will be moved to the right (have their indexes increased by `content.length`).
	 * @param content - content which is being inserted.
	 */
	onInsert(path: UpPath, content: Delta.ProtoNodes): void;
}
