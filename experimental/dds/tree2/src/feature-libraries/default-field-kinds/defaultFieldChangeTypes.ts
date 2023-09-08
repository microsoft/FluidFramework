/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ChangeAtomId,
	ChangesetLocalId,
	ITreeCursorSynchronous,
	JsonableTree,
	RevisionTag,
} from "../../core";
import { NodeChangeset } from "../modular-schema";

export type NodeUpdate =
	| {
			set: JsonableTree;
			changes?: NodeChangeset;
	  }
	| {
			/**
			 * The node being restored.
			 */
			revert: ITreeCursorSynchronous;
			changeId: ChangeAtomId;
			changes?: NodeChangeset;
	  };

export interface OptionalFieldChange {
	/**
	 * Uniquely identifies, in the scope of the changeset, the change made to the field.
	 * Globally unique across all changesets when paired with the changeset's revision tag.
	 */
	readonly id: ChangesetLocalId;

	/**
	 * When populated, indicates the revision that this field change is associated with.
	 * Is left undefined when the revision is the same as that of the whole changeset
	 * (which would also be undefined in the case of an anonymous changeset).
	 */
	readonly revision?: RevisionTag;

	/**
	 * The new content for the trait. If undefined, the trait will be cleared.
	 */
	newContent?: NodeUpdate;

	/**
	 * Whether the field was empty in the state this change is based on.
	 */
	wasEmpty: boolean;
}

export interface OptionalChangeset {
	/**
	 * If defined, specifies the new content for the field.
	 */
	fieldChange?: OptionalFieldChange;

	/**
	 * Changes to nodes which occupied this field prior to this changeset at some point.
	 *
	 * `deletedBy` refers to the revision which deleted the node (via a `fieldChange`, replacing the contents of the field
	 * and thus resetting any nested changes).
	 * "self" is a sentinel value for the revision of the current changeset.
	 * Thus, the childChange for "self" refers to:
	 * - the node this changeset removes, if it involves a field change
	 * - the node currently occupying this field, if it does not involve a field change
	 *
	 * @privateRemarks - Indexing by the revision which deleted the node rather than the one that inserted the node is necessary to support rebase.
	 * Consider rebasing an OptionalChangeset with changes to the 'start' node over one which also has a fieldChange. This would require naming the
	 * original base revision (as 'start' no longer semantically refers to the correct place).
	 *
	 * TODO: This isn't really `deletedBy` as it is so much `contentBefore`, i.e. similar semantics to how childChange worked before.
	 */
	childChanges?: [deletedBy: ChangeAtomId | "self", childChange: NodeChangeset][];
}
