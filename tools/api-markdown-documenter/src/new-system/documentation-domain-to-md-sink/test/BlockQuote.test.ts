/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { BlockQuoteNode, LineBreakNode, PlainTextNode } from "../../documentation-domain";
import { DocumentationNodeRenderer, standardEOL } from "../md-transformers";

describe("BlockQuote markdown tests", () => {
    it("Can render a simple BlockQuote", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new BlockQuoteNode([
                new PlainTextNode("Here's a block quote. "),
                new PlainTextNode("It sure is something!"),
                new LineBreakNode(),
                new LineBreakNode(),
                new PlainTextNode("-BlockQuote"),
            ]),
        );
        const expectedOutput = [
            "> Here's a block quote. It sure is something!",
            "> ",
            "> -BlockQuote",
        ].join(standardEOL);
        expect(renderedForm).to.equal(expectedOutput);
    });
});
