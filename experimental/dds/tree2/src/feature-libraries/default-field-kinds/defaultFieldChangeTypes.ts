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
	  }
	| {
			/**
			 * The change being reverted.
			 */
			revert: ChangeAtomId;
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

	removed: ContentId;

	// /**
	//  * When defined, signifies ContentId which overrides the id of the node occupying this field after the change.
	//  * This is used for restored nodes, either via undo or
	//  *
	//  *
	//  * When undefined, the node occupying this field is implicitly identified via its subsequent removal.
	//  */
	inserted: ContentId;

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
 * TODO: update this whole doc.
 * Id which identifies a piece of content within an optional field.
 * If "start", represents the node occupying the field in the input context of the change
 * If "end", represents the node occupying the field in the output context of the change
 * Otherwise, a ChangeAtomId which identifies the node *removed* by that change.
 *
 * Note that for a given changeset, multiple ids may correspond to the same piece of content.
 * For example, if an optional field has two edits "set A" and "set B", the node A can be referred to by either { type: "before", id: <revision of 'set B'> } OR { type: "after", id: <revision of 'set A'> }.
 * For a change to the child without a corresponding field change, { type: "before", id: "this" } and { type: "after", id: "this" } will both refer to the node currently occupying the field.
 * Generally, change rebaser functions should take care to normalize their output to refer to the most recent change.
 *
 * @remarks - Using a ChangeAtomId associated with the removal of some node rather than the one that inserted that node is necessary to support rebase.
 * Consider rebasing an OptionalChangeset with changes to the 'start' node over one which also has a fieldChange. This would require naming the
 * original base revision (as 'start' no longer semantically refers to the correct place).
 *
 * // { type: "before", id: "this" } represents the node occupying the optional field in the input context of the change
 * // similarly for everything else
 */
export type ContentId = ChangeAtomId | "self";

// Fill
// Clear
// Set = [Fill, Clear]

/**
 * @privateRemarks - This type is used to represent changes to an optional field.
 * Because the same type is reused for singular changes (e.g. "set content to Foo") and compositions of several changes,
 * the format is a bit awkward. TODO: rewrite in more informative terms.
 */
export interface OptionalChangeset {
	build: { set: JsonableTree; id: ChangeAtomId }[];
	moves: [src: ContentId, dst: ContentId, kind: "nodeTargeting" | "cellTargeting"][];

	childChanges: [register: ContentId, childChange: NodeChangeset][];

	// TODO: This should probably live in test code instead. It's unnecessary for production codepath, but makes equivalence assertions easier.
	reservedDetachId?: ContentId;
}
