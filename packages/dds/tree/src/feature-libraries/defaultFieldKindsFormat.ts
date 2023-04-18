/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonableTree, RevisionTag } from "../core";
import { JsonCompatibleReadOnly } from "../util";

export type EncodedNodeUpdate =
	| {
			set: JsonableTree;
			changes?: JsonCompatibleReadOnly;
	  }
	| {
			/**
			 * The node being restored.
			 */
			revert: JsonableTree;
			revision: RevisionTag | undefined;
			changes?: JsonCompatibleReadOnly;
	  };

export interface EncodedValueChangeset {
	value?: EncodedNodeUpdate;
	changes?: JsonCompatibleReadOnly;
}

export interface EncodedOptionalFieldChange {
	/**
	 * The new content for the trait. If undefined, the trait will be cleared.
	 */
	newContent?: EncodedNodeUpdate;

	/**
	 * Whether the field was empty in the state this change is based on.
	 */
	wasEmpty: boolean;
}

export interface EncodedOptionalChangeset {
	fieldChange?: EncodedOptionalFieldChange;
	childChange?: JsonCompatibleReadOnly;
}
