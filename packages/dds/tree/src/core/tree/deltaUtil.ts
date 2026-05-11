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
 * Returns true if a delta field map contains any changes that would be visible in the document (eg, an insert, move, edit)
 * @param fields - Delta FieldMap to check for visible changes
 * @returns True if change map contains any changes that would be visible in the document, false otherwise
 */
export function deltaFieldMapHasVisibleChanges(fields: FieldMap | undefined): boolean {
	if (fields === undefined || fields.size === 0) {
		return false;
	}
	for (const [, fieldChanges] of fields) {
		if (deltaFieldChangesHaveVisibleChanges(fieldChanges)) {
			return true;
		}
	}
	return false;
}

/**
 * Returns true if the given field changes contains any changes that would be visible in the document (eg, an insert, move, edit)
 * @param fieldChanges - Field changes to check for visible changes
 * @returns True if the field changes contain any changes that would be visible in the document, false otherwise
 */
export function deltaFieldChangesHaveVisibleChanges(fieldChanges: FieldChanges): boolean {
	for (const mark of fieldChanges.marks) {
		if (
			mark.attach !== undefined ||
			mark.detach !== undefined ||
			deltaFieldMapHasVisibleChanges(mark.fields)
		) {
			return true;
		}
	}

	return false;
}
