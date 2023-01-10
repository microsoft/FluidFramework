import { DocumentationNode } from "./DocumentionNode";
import { LineBreakNode } from "./LineBreakNode";
import { ParagraphNode } from "./ParagraphNode";
import { PlainTextNode } from "./PlainTextNode";

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

    for (const [i, element] of arrayA.entries()) {
        if (!element.equals(arrayB[i])) {
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

/**
 * Splits plain text (potentially including line breaks) into {@link PlainTextNode}s and {@link LineBreakNode}s as
 * appropriate to preserve the invariant that `PlainTextNode`s do not include line breaks.
 */
export function createNodesFromPlainText(text: string): (PlainTextNode | LineBreakNode)[] {
    const lines = text.split(/\r?\n/g);

    const transformedLines: (PlainTextNode | LineBreakNode)[] = [];
    for (const [index, line] of lines.entries()) {
        if (line.length === 0) {
            transformedLines.push(LineBreakNode.Singleton);
        } else {
            transformedLines.push(new PlainTextNode(line));
        }
        if (index !== lines.length - 1) {
            // Push line break between each entry (not after last entry)
            transformedLines.push(LineBreakNode.Singleton);
        }
    }
    return transformedLines;
}
