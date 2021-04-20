/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bsearch2 } from "./bsearch2";
import { isBrowser } from "./isbrowser";

const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE;

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Dom {
    public static readonly caretPositionFromPoint = isBrowser && document.caretRangeFromPoint
        ? (x: number, y: number) => {
            // CH74/SF12
            const range = document.caretRangeFromPoint(x, y);
            return { offsetNode: range.startContainer, offset: range.startOffset };
        }
        : (x: number, y: number) =>
            // FF66
            document.caretPositionFromPoint(x, y);

    // Returns true if the given 'node' follows the specified 'previous' node in the 'parent' node's children.
    public static isAfterNode(parent: Node, node: Node, previous: Node | null) {
        return previous
            ? previous.nextSibling === node     // If we have a previous sibling, check if node follows it.
            : parent.firstChild === node;       // Otherwise, check if node is first child of parent.
    }

    public static replaceOrRemoveChild(parent: Node, newChild: Node | null, oldChild: Node) {
        if (newChild) {
            parent.replaceChild(newChild, oldChild);
        } else {
            parent.removeChild(oldChild);
        }
    }

    public static replaceFirstChild(parent: Node, newChild: Node) {
        const oldChild = parent.firstChild;
        if (oldChild) {
            Dom.replaceOrRemoveChild(parent, newChild, oldChild);
        } else if (newChild) {
            Dom.prependChild(parent, newChild);
        }
    }

    public static ensureFirstChild(parent: Node, desiredChild: Node) {
        if (parent.firstChild !== desiredChild) {
            Dom.replaceFirstChild(parent, desiredChild);
        }
    }

    public static removeAllChildren(parent: Node) {
        let firstChild: ChildNode | null;

        // eslint-disable-next-line no-null/no-null
        while ((firstChild = parent.firstChild) !== null) {
            firstChild.remove();
        }
    }

    /**
     * Inserts the given 'newChild' immediately after the given 'refChild'.  If 'refChild' is undefined,
     * inserts 'newChild' as the first child of 'parent'.
     */
    public static insertAfter(parent: Node, newChild: Node, refChild: Node | null) {
        parent.insertBefore(newChild, refChild ? refChild.nextSibling : parent.firstChild);
    }

    public static prependChild(parent: Node, newChild: Node) {
        parent.insertBefore(newChild, parent.firstChild);
    }

    public static getClientRect(node: Node, nodeOffset: number): ClientRect {
        if (isElement(node)) {
            console.assert(!nodeOffset);
            return node.getBoundingClientRect();
        }

        const measurementRange = document.createRange();
        measurementRange.setStart(node, nodeOffset);
        measurementRange.setEnd(node, nodeOffset);

        // Note: On Safari 12, 'domRange.getBoundingClientRect()' returns an empty rectangle when domRange
        // start === end. However, 'getClientRects()' for the same range returns the expected 0-width rect.
        return measurementRange.getClientRects()[0];
    }

    // Returns the closest { segment, offset } to the 0-width rect described by x/top/bottom.
    public static findNodeOffset(node: Node, x: number, yMin: number, yMax: number) {
        const domRange = document.createRange();
        return bsearch2((m) => {
            domRange.setStart(node, m);
            domRange.setEnd(node, m);

            // Note: On Safari 12, 'domRange.getBoundingClientRect()' returns an empty rectangle when domRange
            // start === end. However, 'getClientRects()' for the same range returns the expected 0-width rect.
            const bounds = domRange.getClientRects()[0];
            const cy = (bounds.top + bounds.bottom) / 2;
            return ((cy < yMin)                                // Current position is above our target rect.
                || (cy < yMax && bounds.left < x));            // Current position is within our desired y range.
        }, 0, node.textContent.length);
    }
}
