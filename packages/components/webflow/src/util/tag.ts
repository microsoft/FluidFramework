/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocSegmentKind } from "../document";

// Note: Tag names must be uppercase for comparison with HTMLElement.tagName via '=='.
export const enum Tag {
    listItem    = "LI",
    orderedList = "OL",
    paragraph   = "P",
    span        = "SPAN",
    lineBreak   = "BR",
}

const segmentKindToIdPrefix = {
    [DocSegmentKind.beginTag]: "b:",
    [DocSegmentKind.endRange]: "e:",
};

const segmentKindToOppositeIdPrefix = {
    [DocSegmentKind.beginTag]: "e:",
    [DocSegmentKind.endRange]: "b:",
};

export function createTags(tags: Tag[]) {
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
    return prefix
        ? `${prefix}${id}`
        : id;
}

export function removeIdPrefix(kind: DocSegmentKind, id: string) {
    const prefix = segmentKindToIdPrefix[kind];
    return prefix
        ? id.slice(prefix.length)
        : id;
}

export function getIdForOpposite(kind: DocSegmentKind, id: string) {
    const oldPrefix = segmentKindToIdPrefix[kind];
    const newPrefix = segmentKindToOppositeIdPrefix[kind];

    return `${newPrefix}${id.slice(oldPrefix.length)}`;
}
