/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ChangeAtomId,
	ChangeAtomIdMap,
	ChangesetLocalId,
	FieldKey,
	FieldKindIdentifier,
	RevisionInfo,
} from "../../core/index.js";
import type { Brand } from "../../util/index.js";
import type { TreeChunk } from "../chunked-forest/index.js";

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
	readonly nodeChanges: ChangeAtomIdMap<NodeChangeset>;
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

export type NodeId = ChangeAtomId;

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
	change: FieldChangeset;
}

/**
 * @internal
 */
export type FieldChangeset = Brand<unknown, "FieldChangeset">;
