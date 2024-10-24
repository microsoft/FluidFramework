/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Brand, ReadonlyNestedMap } from "../../util/index.js";
import type { RevisionTag } from "../rebase/index.js";

export type Major = RevisionTag | undefined;
export type Minor = number;

export interface DetachedFieldSummaryData {
	readonly data: ReadonlyNestedMap<Major, Minor, DetachedField>;
	readonly maxId: ForestRootId;
}

/**
 * ID used to create a detached field key for a removed subtree.
 *
 * TODO: Move to Forest once forests can support multiple roots.
 */
export type ForestRootId = Brand<number, "tree.ForestRootId">;

/**
 * A field that is detached from the main document tree.
 */
export interface DetachedField {
	/**
	 * The atomic ID that the `DetachedFieldIndex` uses to uniquely identify the first (and only) root in the field.
	 * This ID is scoped to the specific `DetachedFieldIndex` from which this object was retrieved.
	 *
	 * The current implementation only supports a single root per field.
	 * This will be changed in the future for performance reasons.
	 */
	readonly root: ForestRootId;
	/**
	 * The revision that last detached the root node or modified its contents (including its descendant's contents).
	 *
	 * Once this revision is trimmed from the ancestry on which a `TreeCheckout` is moored,
	 * the contents of the associated subtree (and the very fact of its past existence) can be erased.
	 *
	 * @remarks
	 * undefined revisions are tolerated but any roots not associated with a revision must be disposed manually.
	 * Current usages of undefined are:
	 * - When loading a {@link DetachedFieldIndex} from a snapshot,
	 * until {@link DetachedFieldIndex.setRevisionsForLoadedData} is called.
	 * - When applying a rollback changeset.
	 * This only occurs within the context of {@link DefaultResubmitMachine} whose repair data is GC-ed when its
	 * `DetachedField` and `Forest` are GC-ed.
	 */
	readonly latestRelevantRevision?: RevisionTag;
}
