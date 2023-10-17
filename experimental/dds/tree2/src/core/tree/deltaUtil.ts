/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeCursorSynchronous } from "./cursor";
import { Root, DetachedNodeId } from "./delta";
import { rootFieldKey } from "./types";

export const emptyDelta: Root<never> = new Map();

export function deltaForRootInitialization(content: readonly ITreeCursorSynchronous[]) {
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
