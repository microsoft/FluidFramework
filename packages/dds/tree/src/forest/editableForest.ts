/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StoredSchemaRepository } from "../schema";
import { AnchorSet, FieldKey, DetachedField, Delta } from "../tree";
import { IForestSubscription, ITreeSubscriptionCursor, ForestAnchor } from "./forest";

/**
 * Editing APIs.
 */
export interface IEditableForest extends IForestSubscription {
	// Overrides field from IForestSubscription adding editing support.
	readonly schema: StoredSchemaRepository;

	/**
	 * Adds the supplied subtrees to the forest.
	 * @param nodes - the sequence of nodes to add to the forest.
	 *
	 * TODO: there should be a way to include existing detached ranges in the inserted trees.
	 */
	add(nodes: Iterable<ITreeCursor>): DetachedRange;

	/**
	 * Applies the supplied Delta to the forest.
	 * Does NOT update anchors.
	 */
	applyDelta(delta: Delta.Root): void;
}

// TODO: Types below here may be useful for input into edit building APIs, but are no longer used here directly.

/**
 * Ways to refer to a node in an IEditableForest.
 */
export type ForestLocation = ITreeSubscriptionCursor | ForestAnchor;

export interface TreeLocation {
	readonly range: FieldLocation | DetachedField;
	readonly index: number;
}

export function isFieldLocation(range: FieldLocation | DetachedField): range is FieldLocation {
	return typeof range === "object";
}

/**
 * Wrapper around DetachedField that can be detected at runtime.
 */
export interface FieldLocation {
	readonly key: FieldKey;
	readonly parent: ForestLocation;
}
