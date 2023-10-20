/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mutable } from "../../util";
import { ITreeCursorSynchronous } from "./cursor";
import { Root, DetachedNodeId, FieldChanges, Mark } from "./delta";
import { rootFieldKey } from "./types";

export const emptyDelta: Root<never> = new Map();

export const emptyFieldChanges: FieldChanges<never> = {};

export function isEmptyFieldChanges(fieldChanges: FieldChanges): boolean {
	return (
		fieldChanges.attached === undefined &&
		fieldChanges.detached === undefined &&
		fieldChanges.build === undefined &&
		fieldChanges.rename === undefined
	);
}

export function deltaForRootInitialization(content: readonly ITreeCursorSynchronous[]): Root {
	if (content.length === 0) {
		return emptyDelta;
	}
	const buildId = { minor: 0 };
	const delta: Root = new Map([
		[
			rootFieldKey,
			{
				build: [{ id: buildId, trees: content }],
				attached: [{ count: content.length, attach: buildId }],
			},
		],
	]);
	return delta;
}

export function deltaForSet(
	newNode: ITreeCursorSynchronous,
	buildId: DetachedNodeId,
	detachId?: DetachedNodeId,
): FieldChanges {
	const mark: Mutable<Mark> = { count: 1, attach: buildId };
	if (detachId !== undefined) {
		mark.detach = detachId;
	}
	return {
		build: [{ id: buildId, trees: [newNode] }],
		attached: [mark],
	};
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

export function areDetachedNodeIdsEqual(a: DetachedNodeId, b: DetachedNodeId): boolean {
	return a.major === b.major && a.minor === b.minor;
}
