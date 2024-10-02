/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ProtoNodes } from "./delta.js";
import type {
	DetachedPlaceUpPath,
	DetachedRangeUpPath,
	PlaceUpPath,
	RangeUpPath,
	UpPath,
} from "./pathTree.js";

/**
 * Delta visitor for the path tree.
 *
 * For any of these events, the paths are guaranteed to be valid at the time of the event,
 * and it is valid to read from the Forest at that path.
 */
export interface PathVisitor {
	/**
	 * Invoked after the creation of a range of nodes.
	 * @param content - The content that was created.
	 */
	afterCreate(content: DetachedRangeUpPath): void;

	/**
	 * Invoked before the attaching of a range of nodes.
	 * Not invoked for replacements.
	 * @param source - The content that will be attached.
	 * @param destination - The location where the content will be attached.
	 * @param kind - The kind of replacement that will occur.
	 */
	beforeAttach(source: DetachedRangeUpPath, destination: PlaceUpPath): void;

	/**
	 * Invoked after the attaching of a range of nodes.
	 * Not invoked for replacements.
	 * @param source - The location where the content originated.
	 * @param destination - The content that was attached.
	 * @param kind - The kind of replacement that will occur.
	 */
	afterAttach(source: DetachedPlaceUpPath, destination: RangeUpPath): void;

	/**
	 * Invoked before the detaching of a range of nodes.
	 * Not invoked for replacements.
	 * @param source - The content that will be detached.
	 * @param destination - The location where the content will be sent to.
	 * @param kind - The kind of replacement that will occur.
	 */
	beforeDetach(source: RangeUpPath, destination: DetachedPlaceUpPath): void;

	/**
	 * Invoked after the detaching of a range of nodes.
	 * Not invoked for replacements.
	 * @param source - The content that was detached.
	 * @param destination - The location where the content will be attached.
	 * @param kind - The kind of replacement that will occur.
	 */
	afterDetach(source: PlaceUpPath, destination: DetachedRangeUpPath): void;

	/**
	 * Invoked before the replacement of a range of nodes.
	 *
	 * Note that the `newContent` range length will always match the `oldContent` range length.
	 * A replace might actually be separate detaches and attaches which have been coalesced.
	 *
	 * @param newContent - The content that will be attached in place of the old.
	 * @param oldContent - The old that will be replaced.
	 * @param oldContentDestination - The destination of the old content.
	 * @param kind - The kind of replacement that will occur.
	 */
	beforeReplace(
		newContent: DetachedRangeUpPath,
		oldContent: RangeUpPath,
		oldContentDestination: DetachedPlaceUpPath,
	): void;

	/**
	 * Invoked after the replacement of a range of nodes.
	 *
	 * Note that the `newContent` range length will always match the `oldContent` range length.
	 * A replace might actually be separate detaches and attaches which have been coalesced.
	 *
	 * @param newContentSource - The place that the new content came from.
	 * @param newContent - The new content.
	 * @param oldContent - The content that was replaced.
	 */
	afterReplace(
		newContentSource: DetachedPlaceUpPath,
		newContent: RangeUpPath,
		oldContent: DetachedRangeUpPath,
	): void;

	/**
	 * Invoked before content is destroyed.
	 * @param content - The content that will be destroyed
	 */
	beforeDestroy(content: DetachedRangeUpPath): void;

	/**
	 * A sequence of nodes of length `count` is being removed starting with `path`.
	 * Called when these nodes are no longer parented under their previous parent, and do not have a new parent.
	 * It is possible they may be restored in the future (for example by a conflicted merge or undo).
	 *
	 * Not called for children of removed nodes.
	 *
	 * @param path - first node in the removed range.
	 * @param count - length of removed range.
	 *
	 * @deprecated Migrate to using the other events.
	 */
	onRemove(path: UpPath, count: number): void;
	/**
	 * @param path - location which first node of inserted range will have after insert.
	 * Any nodes at this index (or after it) will be moved to the right (have their indexes increased by `content.length`).
	 * @param content - content which is being inserted.
	 *
	 * @deprecated Migrate to using the other events.
	 */
	onInsert(path: UpPath, content: ProtoNodes): void;
}
