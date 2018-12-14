function isElement(node: Node): node is Element {
    return node.nodeType === Node.ELEMENT_NODE;
}

const measurementRange = document.createRange();

export class Dom {
    /** Returns true if the given 'node' follows the specified 'previous' node in the 'parent' node's children. */
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
            this.replaceOrRemoveChild(parent, newChild, oldChild);
        } else if (newChild) {
            this.prependChild(parent, newChild);
        }
    }

    /** 
     * Inserts the given 'newChild' immediately after the given 'refChild'.  If 'refChild' is undefined,
     * inserts 'newChild' as the first child of 'parent'.
     */
    public static insertAfter(parent: Node, newChild: Node, refChild: Node | null) {
        parent.insertBefore(newChild, refChild && refChild.nextSibling);
    }

    public static prependChild(parent: Node, newChild: Node) {
        parent.insertBefore(newChild, parent.firstChild);
    }

    public static getClientRect(node: Node, nodeOffset: number) {
        if (isElement(node)) {
            console.assert(!nodeOffset);
            return node.getBoundingClientRect();
        }

        measurementRange.setStart(node, nodeOffset);
        measurementRange.setEnd(node, nodeOffset);
        
        // Note: On Safari 12, 'domRange.getBoundingClientRect()' returns an empty rectangle when domRange start === end.
        //       However, 'getClientRects()' for the same range returns the expected 0-width rect.        
        return measurementRange.getClientRects()[0];
    }
}