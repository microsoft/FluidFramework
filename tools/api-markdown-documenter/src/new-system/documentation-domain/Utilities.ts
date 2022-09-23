import { DocumentationNode } from "./DocumentionNode";
import { ParagraphNode } from "./ParagraphNode";

/**
 * Compare two arrays and return true if their elements are equivalent and in the same order.
 */
export function compareNodeArrays<TNode extends DocumentationNode>(
    arrayA: readonly TNode[],
    arrayB: readonly TNode[],
): boolean {
    if (arrayA.length !== arrayB.length) {
        return false;
    }

    for (let i = 0; i < arrayA.length; i++) {
        if (!arrayA[i].equals(arrayB[i])) {
            return false;
        }
    }

    return true;
}

/**
 * Combines the contents of 1 or more {@link ParagraphNode}s into a single node.
 */
export function combineParagraphNodes(...nodes: ParagraphNode[]): ParagraphNode {
    const children: DocumentationNode[] = [];
    for (const node of nodes) {
        children.push(...node.children);
    }

    return new ParagraphNode(children);
}
