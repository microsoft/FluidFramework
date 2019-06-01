import * as registerDebug from "debug";

export const debug = registerDebug("flow:editor");

export function nodeAndOffsetToString(node: Node, nodeOffset: number) {
    return `'${node && node.textContent}':${nodeOffset}`;
}

export function domRangeToString(startNode: Node | null, startOffset: number, endNode: Node | null, endOffset: number) {
    return `${nodeAndOffsetToString(startNode, startOffset)}..${nodeAndOffsetToString(endNode, endOffset)}`;
}

export function windowSelectionToString() {
    const { anchorNode, anchorOffset, focusNode, focusOffset } = window.getSelection();
    return domRangeToString(anchorNode, anchorOffset, focusNode, focusOffset);
}
