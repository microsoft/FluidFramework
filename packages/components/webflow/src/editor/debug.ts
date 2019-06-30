/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as registerDebug from "debug";

export const debug = registerDebug("flow:editor");

export function nodeToString(node: Node | Element) {
    if (node) {
        if ("tagName" in node) {
            return `<${node.tagName}>`;
        } else {
            return `'${node.textContent}'`;
        }
    } else {
        return `${node}`;
    }
}

export function nodeAndOffsetToString(node: Node, nodeOffset: number) {
    return `${nodeToString(node)}:${nodeOffset}`;
}

export function domRangeToString(startNode: Node | null, startOffset: number, endNode: Node | null, endOffset: number) {
    return `${nodeAndOffsetToString(startNode, startOffset)}..${nodeAndOffsetToString(endNode, endOffset)}`;
}

export function windowSelectionToString() {
    const { anchorNode, anchorOffset, focusNode, focusOffset } = window.getSelection();
    return domRangeToString(anchorNode, anchorOffset, focusNode, focusOffset);
}
