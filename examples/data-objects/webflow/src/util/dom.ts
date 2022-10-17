/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE;

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Dom {
    public static removeAllChildren(parent: Node) {
        // External library uses `null`
        // eslint-disable-next-line @rushstack/no-new-null
        let firstChild: ChildNode | null;
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
}
