/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey } from "../schema-stored/index.js";
import type { Anchor, DeltaVisitor, DetachedField } from "../tree/index.js";

import type { IForestSubscription, ITreeSubscriptionCursor } from "./forest.js";

/**
 * Editing APIs.
 */
export interface IEditableForest extends IForestSubscription {
	/**
	 * Provides a visitor that can be used to mutate the forest.
	 *
	 * @returns a visitor that can be used to mutate the forest.
	 *
	 * @remarks
	 * Mutating the forest does NOT update anchors.
	 * The visitor must be released after use by calling {@link DeltaVisitor.free} on it.
	 * It is invalid to acquire a visitor without releasing the previous one.
	 */
	acquireVisitor(): DeltaVisitor;
}

// TODO: Types below here may be useful for input into edit building APIs, but are no longer used here directly.

/**
 * Ways to refer to a node in an IEditableForest.
 */
export type ForestLocation = ITreeSubscriptionCursor | Anchor;

/**
 */
export interface TreeLocation {
	readonly range: FieldLocation | DetachedField;
	readonly index: number;
}

export function isFieldLocation(range: FieldLocation | DetachedField): range is FieldLocation {
	return typeof range === "object";
}

/**
 * Location of a field within a tree that is not a detached/root field.
 */
export interface FieldLocation {
	readonly key: FieldKey;
	readonly parent: ForestLocation;
}
