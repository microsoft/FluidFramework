/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Mutable } from "../../util/index.js";
import type { FieldKey } from "../schema-stored/index.js";
import type { TreeChunk } from "./chunk.js";

import type { DetachedNodeId, FieldChanges, Mark, Root } from "./delta.js";
import { rootFieldKey } from "./types.js";

export const emptyDelta: Root = {};

export function isAttachMark(mark: Mark): boolean {
	return mark.attach !== undefined && mark.detach === undefined;
}

export function isDetachMark(mark: Mark): boolean {
	return mark.detach !== undefined && mark.attach === undefined;
}

export function isReplaceMark(mark: Mark): boolean {
	return mark.detach !== undefined && mark.attach !== undefined;
}

export function deltaForRootInitialization(content: TreeChunk): Root {
	if (content.topLevelLength === 0) {
		return emptyDelta;
	}
	const buildId = { minor: 0 };
	const delta: Root = {
		build: [{ id: buildId, trees: content }],
		fields: new Map<FieldKey, FieldChanges>([
			[rootFieldKey, [{ count: content.topLevelLength, attach: buildId }]],
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
