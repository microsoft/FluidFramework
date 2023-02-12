/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocSegmentKind } from "../document";
import { TagName } from "./tagName";

const segmentKindToIdPrefix = {
	[DocSegmentKind.beginTags]: "b:",
	[DocSegmentKind.endTags]: "e:",
};

const segmentKindToOppositeIdPrefix = {
	[DocSegmentKind.beginTags]: "e:",
	[DocSegmentKind.endTags]: "b:",
};

export function createTags(tags: TagName[]) {
	const root = document.createElement(tags[0]);
	let slot: HTMLElement = root;
	for (let i = 1; i < tags.length; i++) {
		slot.appendChild(document.createElement(tags[i]));
		slot = slot.lastElementChild as HTMLElement;
	}
	return { root, slot };
}

export function addIdPrefix(kind: DocSegmentKind, id: string) {
	const prefix = segmentKindToIdPrefix[kind];
	return prefix ? `${prefix}${id}` : id;
}

export function removeIdPrefix(kind: DocSegmentKind, id: string) {
	const prefix = segmentKindToIdPrefix[kind];
	return prefix ? id.slice(prefix.length) : id;
}

export function getIdForOpposite(kind: DocSegmentKind, id: string) {
	const oldPrefix = segmentKindToIdPrefix[kind];
	const newPrefix = segmentKindToOppositeIdPrefix[kind];

	return `${newPrefix}${id.slice(oldPrefix.length)}`;
}
