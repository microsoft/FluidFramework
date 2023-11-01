/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeAtomId, ChangesetLocalId, JsonableTree, RevisionTag } from "../../core";
import { NodeChangeset } from "../modular-schema";

export type NodeUpdate =
	| {
			set: JsonableTree;
			/**
			 * ID associated with the creation of the new tree.
			 */
			buildId: ChangeAtomId;
			changes?: NodeChangeset;
	  }
	| {
			/**
			 * The change being reverted.
			 */
			revert: ChangeAtomId;
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

	// TODO: This is no longer necessary for each change within array of field changes.
	// Maybe should be moved to OptionalChangeset.
	/**
	 * Whether the field was empty in the state this change is based on.
	 */
	wasEmpty: boolean;
}

/**
 * TL;DR:
 *
 * The general representation here needs to be closed under composition of optional changesets (though this shouldn't typically go over the wire, though
 * there are some complications with transactions that I haven't thought through).
 *
 * A single optional change comprises a (maybe) change to the root field, and a (maybe) change to the child of the existing fields' contents.
 *
 * Since the format must support rebasing such a change over other changes faithfully as well as composing it with other changes (and inverses),
 * this leads to a representation where an optional changeset specifies:
 *
 * - A sequence of changes to the root field (implies ordered) which were applied in succession
 */

/**
 * @privateRemarks - This type is used to represent changes to an optional field.
 * Because the same type is reused for singular changes (e.g. "set content to Foo") and compositions of several changes,
 * the format is a bit awkward. TODO: rewrite in more informative terms.
 */
export interface OptionalChangeset {
	/**
	 * If length > 0, the last element specifies new content for the field.
	 * Other elements specify intermediate states of the field
	 * @remarks - Intermediate content should generally not need to be communicated over the wire, but is necessary at
	 * rebase and compose time to produce correct results axiomatically.
	 */
	fieldChanges: OptionalFieldChange[];

	activeFieldChange: ChangeAtomId | "start" | "end";

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
