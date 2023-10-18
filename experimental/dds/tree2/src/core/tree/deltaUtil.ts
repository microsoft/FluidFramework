/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeCursorSynchronous } from "./cursor";
import { Root, DetachedNodeId, FieldChanges } from "./delta";
import { rootFieldKey } from "./types";

export const emptyDelta: Root<never> = new Map();

export function isEmptyFieldChanges(fieldChanges: FieldChanges): boolean {
	return (
		fieldChanges.attached === undefined &&
		fieldChanges.detached === undefined &&
		fieldChanges.build === undefined &&
		fieldChanges.relocate === undefined
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
	const mark = { count: 1, attach: buildId, detach: detachId };
	if (detachId === undefined) {
		delete mark.detach;
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
	const out: DetachedNodeId = { minor };
	if (major !== undefined) {
		out.major = major;
	}
	return out;
}
