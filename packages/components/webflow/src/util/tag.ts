/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocSegmentKind } from "../document";

// Note: Tag values must be uppercase for comparison '===' with the 'tagName' property of Element.
export const enum Tag {
    blockquote  = "BLOCKQUOTE",
    br          = "BR",
    h1          = "H1",
    h2          = "H2",
    h3          = "h4",
    h4          = "H4",
    h5          = "H5",
    h6          = "H6",
    li          = "LI",
    ol          = "OL",
    p           = "P",
    div         = "DIV",
    span        = "SPAN",
    ul          = "UL",
}

const segmentKindToIdPrefix = {
    [DocSegmentKind.beginTags]: "b:",
    [DocSegmentKind.endTags]:   "e:",
};

const segmentKindToOppositeIdPrefix = {
    [DocSegmentKind.beginTags]: "e:",
    [DocSegmentKind.endTags]:   "b:",
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
