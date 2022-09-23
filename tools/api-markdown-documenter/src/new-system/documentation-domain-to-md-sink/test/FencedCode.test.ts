/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { FencedCodeBlockNode, PlainTextNode } from "../../documentation-domain";
import { DocumentationNodeRenderer } from "../md-transformers";
import { standardEOL } from "../md-transformers/Utilities";

describe("CodeSpan markdown tests", () => {
    it("Can render a simple FencedCodeBlock", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new FencedCodeBlockNode(
                [new PlainTextNode("console.log('hello world');")],
                "typescript",
            ),
        );
        const expectedOutput = ["```typescript", "console.log('hello world');", "```", ""].join(
            standardEOL,
        );
        expect(renderedForm).to.equal(expectedOutput);
    });
});
