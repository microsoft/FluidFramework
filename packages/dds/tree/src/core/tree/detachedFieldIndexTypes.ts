/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionSpaceCompressedId } from "@fluidframework/id-compressor";

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
 * @internal
 */
export type ForestRootId = Brand<number, "tree.ForestRootId">;

/**
 * fake revision used to mark that the revision stored in a {@link DetachedFieldIndex} is not yet
 * set after loading data from a summary
 */
export const fakeRevisionWhenNotSet = Number.NaN as SessionSpaceCompressedId;

/**
 * A field that is detached from the main document tree.
 */
export interface DetachedField {
	/**
	 * The atomic ID that the `DetachedFieldIndex` uses to uniquely identify the first (and only) root in the field.
	 * This ID is scoped to the specific `DetachedFieldIndex` from witch this object was retrieved.
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
	 * undefined revisions are tolerated but any roots not associated with a revision must be disposed manually
	 */
	readonly latestRelevantRevision: RevisionTag | undefined;
}
