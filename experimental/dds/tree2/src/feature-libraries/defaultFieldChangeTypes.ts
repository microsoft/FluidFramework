/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeCursorSynchronous, JsonableTree } from "../core";
import { ChangeAtomId, NodeChangeset } from "./modular-schema";

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

export interface ValueChangeset {
	value?: NodeUpdate;
	changes?: NodeChangeset;
}

export interface OptionalFieldChange {
	/**
	 * Uniquely identifies the change made to the field.
	 */
	readonly id: ChangeAtomId;

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
	 * Changes to the node which were in the field before this changeset is applied, or the node deleted in this field in the given revision
	 */
	childChange?: NodeChangeset;

	/**
	 * The change that the node `childChange` is referring to was deleted by.
	 * If undefined, `childChange` refers to the node currently in this field.
	 *
	 * This representation is sufficient for representing changes to the node present before this changeset and
	 * after this changeset, but not for changes to nodes that existed only transiently in a transaction.
	 */
	deletedBy?: ChangeAtomId;
}
