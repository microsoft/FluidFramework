/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mutable } from "../../util";
import { FieldKey } from "../schema-stored";
import { ITreeCursorSynchronous } from "./cursor";
import { Root, DetachedNodeId, FieldChanges, Mark } from "./delta";
import { rootFieldKey } from "./types";

export const emptyDelta: Root<never> = {};

export const emptyFieldChanges: FieldChanges<never> = {};

export function isAttachMark(mark: Mark): boolean {
	return mark.attach !== undefined && mark.detach === undefined;
}

export function isDetachMark(mark: Mark): boolean {
	return mark.detach !== undefined && mark.attach === undefined;
}

export function isReplaceMark(mark: Mark): boolean {
	return mark.detach !== undefined && mark.attach !== undefined;
}

export function isEmptyFieldChanges(fieldChanges: FieldChanges): boolean {
	return (
		fieldChanges.local === undefined &&
		fieldChanges.global === undefined &&
		fieldChanges.build === undefined &&
		fieldChanges.rename === undefined
	);
}

export function deltaForRootInitialization(content: readonly ITreeCursorSynchronous[]): Root {
	if (content.length === 0) {
		return emptyDelta;
	}
	const buildId = { minor: 0 };
	const delta: Root = {
		build: [{ id: buildId, trees: content }],
		fields: new Map<FieldKey, FieldChanges>([
			[
				rootFieldKey,
				{
					local: [{ count: content.length, attach: buildId }],
				},
			],
		]),
	};
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
		local: [mark],
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
