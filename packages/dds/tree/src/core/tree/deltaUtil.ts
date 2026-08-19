/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Mutable } from "../../util/index.js";
import type { FieldKey } from "../schema-stored/index.js";

import type { TreeChunk } from "./chunk.js";
import type { DetachedNodeId, FieldChanges, FieldMap, Root } from "./delta.js";
import { rootFieldKey } from "./types.js";

export const emptyDelta: Root = {};

export function deltaForRootInitialization(content: TreeChunk): Root {
	if (content.topLevelLength === 0) {
		return emptyDelta;
	}
	const buildId = { minor: 0 };
	const delta: Root = {
		build: [{ id: buildId, trees: content }],
		fields: new Map<FieldKey, FieldChanges>([
			[rootFieldKey, { marks: [{ count: content.topLevelLength, attach: buildId }] }],
		]),
	};
	return delta;
}

export function makeDetachedNodeId(
	major: DetachedNodeId["major"],
	minor: DetachedNodeId["minor"],
): DetachedNodeId {
	const out: Mutable<DetachedNodeId> = { minor };
	if (major !== undefined) {
		out.major = major;
	}
	return out;
}

export function offsetDetachId(id: DetachedNodeId, offset: number): DetachedNodeId;
export function offsetDetachId(
	id: DetachedNodeId | undefined,
	offset: number,
): DetachedNodeId | undefined;
export function offsetDetachId(
	id: DetachedNodeId | undefined,
	offset: number,
): DetachedNodeId | undefined {
	if (id === undefined) {
		return undefined;
	}
	return {
		...id,
		minor: id.minor + offset,
	};
}

export function areDetachedNodeIdsEqual(a: DetachedNodeId, b: DetachedNodeId): boolean {
	return a.major === b.major && a.minor === b.minor;
}

/**
 * Describes the types of changes present in a delta.
 */
export interface DeltaChangeProfile {
	/** Whether the delta includes any build operations. */
	hasBuilds: boolean;
	/** Whether the delta includes any destroy operations. */
	hasDestroys: boolean;
	/** Whether the delta includes any rename operations. */
	hasRenames: boolean;
	/** Whether the delta includes any changes in the document tree. */
	hasChangesInDocumentTree: boolean;
	/** Whether the delta includes any changes in detached trees. */
	hasChangesInDetachedTrees: boolean;
}

/**
 * Reports the kinds of changes present in a delta.
 * @param delta - The delta to analyze.
 * @returns An object indicating which kinds of changes are present.
 */
export function getDeltaChangeProfile(delta: Root): DeltaChangeProfile {
	const profile: DeltaChangeProfile = {
		hasBuilds: delta.build !== undefined && delta.build.length > 0,
		hasDestroys: delta.destroy !== undefined && delta.destroy.length > 0,
		hasRenames: delta.rename !== undefined && delta.rename.length > 0,
		hasChangesInDocumentTree: deltaFieldMapHasChanges(delta.fields),
		hasChangesInDetachedTrees:
			delta.global?.some((detachedNodeChanges) =>
				deltaFieldMapHasChanges(detachedNodeChanges.fields),
			) === true,
	};
	return profile;
}

/**
 * Returns true if a delta field map contains any changes.
 * Note that the changes may not be noticeable to the user (e.g., a change that replaces a node with another structurally identical node).
 * @param fields - Delta FieldMap to check for changes
 * @returns True if change map contains any changes, false otherwise
 */
export function deltaFieldMapHasChanges(fields: FieldMap | undefined): boolean {
	if (fields === undefined || fields.size === 0) {
		return false;
	}
	for (const [, fieldChanges] of fields) {
		if (deltaFieldChangesHaveChanges(fieldChanges)) {
			return true;
		}
	}
	return false;
}

/**
 * Returns true if the given field changes contain any changes.
 * Note that the changes may not be noticeable to the user (e.g., a change that replaces a node with another structurally identical node).
 * @param fieldChanges - Field changes to check for changes
 * @returns True if the field changes contain any changes, false otherwise
 */
export function deltaFieldChangesHaveChanges(fieldChanges: FieldChanges): boolean {
	for (const mark of fieldChanges.marks) {
		if (
			mark.attach !== undefined ||
			mark.detach !== undefined ||
			deltaFieldMapHasChanges(mark.fields)
		) {
			return true;
		}
	}

	return false;
}
