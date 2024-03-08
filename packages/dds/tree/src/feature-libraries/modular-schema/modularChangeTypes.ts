/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ChangeAtomIdMap,
	ChangesetLocalId,
	FieldKey,
	FieldKindIdentifier,
	RevisionInfo,
	RevisionTag,
} from "../../core/index.js";
import { Brand } from "../../util/index.js";
import { TreeChunk } from "../chunked-forest/index.js";

/**
 * @internal
 */
export interface ModularChangeset extends HasFieldChanges {
	/**
	 * The numerically highest `ChangesetLocalId` used in this changeset.
	 * If undefined then this changeset contains no IDs.
	 */
	readonly maxId?: ChangesetLocalId;
	/**
	 * The revisions included in this changeset, ordered temporally (oldest to newest).
	 * Undefined for anonymous changesets.
	 * Should never be empty.
	 */
	readonly revisions?: readonly RevisionInfo[];
	readonly fieldChanges: FieldChangeMap;
	readonly constraintViolationCount?: number;
	readonly builds?: ChangeAtomIdMap<TreeChunk>;
	readonly destroys?: ChangeAtomIdMap<number>;
	readonly refreshers?: ChangeAtomIdMap<TreeChunk>;
}

/**
 * @internal
 */
export interface NodeExistsConstraint {
	violated: boolean;
}

/**
 * Changeset for a subtree rooted at a specific node.
 * @internal
 */
export interface NodeChangeset extends HasFieldChanges {
	nodeExistsConstraint?: NodeExistsConstraint;
}

/**
 * @internal
 */
export interface HasFieldChanges {
	fieldChanges?: FieldChangeMap;
}

/**
 * @internal
 */
export type FieldChangeMap = Map<FieldKey, FieldChange>;

/**
 * @internal
 */
export interface FieldChange {
	fieldKind: FieldKindIdentifier;

	/**
	 * If defined, `change` is part of the specified revision.
	 * Undefined in the following cases:
	 * A) A revision is specified on an ancestor of this `FieldChange`, in which case `change` is part of that revision.
	 * B) `change` is composed of multiple revisions.
	 * C) `change` is part of an anonymous revision.
	 */
	revision?: RevisionTag;
	change: FieldChangeset;
}

/**
 * @internal
 */
export type FieldChangeset = Brand<unknown, "FieldChangeset">;
