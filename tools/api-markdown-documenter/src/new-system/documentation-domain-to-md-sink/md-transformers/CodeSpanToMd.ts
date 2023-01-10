/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { CodeSpanNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";

/**
 * Recursively enumerates an CodeSpanNode to generate a markdown code span block.
 *
 * @param codeSpanNode - CodeSpanNode to convert into markdown
 * @param renderer - Renderer to recursively render child subtrees
 * @returns The markdown representation of the CodeSpanNode as a string
 */
export function CodeSpanToMarkdown(
    codeSpanNode: CodeSpanNode,
    renderer: DocumentationNodeRenderer,
): string {
    renderer.setInsideCodeBlock();
    const childContents = renderer.renderNodes(codeSpanNode.children);

    let output: string[] = [];
    output = renderer.isInsideTable
        ? [
              "<code>",
              // TODO: Linebreaks get converted to <brs> automatically. Do we need this?
              // Also: Do we need to wrap each linebroken line in its own <code> block? this came from the original markdown emitters, but it's not clear
              // if it's needed
              childContents.split(/\r?\n/g).join("</code><br/><code>"),
              "</code>",
          ]
        : ["`", childContents, "`"];
    return output.join("");
}
