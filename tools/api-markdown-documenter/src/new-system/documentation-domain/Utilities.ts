import { DocumentationNode } from "./DocumentionNode";

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
