/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import {
    DocumentNode,
    HeadingNode,
    HierarchicalSectionNode,
    ParagraphNode,
    PlainTextNode,
} from "../../documentation-domain";
import { markdownFromDocumentNode } from "../md-transformers";
import { standardEOL } from "../md-transformers/Utilities";

describe("Document markdown tests", () => {
    it("Renders a simple document", () => {
        const document = new DocumentNode(
            [
                new ParagraphNode([
                    new PlainTextNode("This is a sample document. "),
                    new PlainTextNode("It has very basic content"),
                ]),
                new HierarchicalSectionNode(
                    [
                        new ParagraphNode([
                            new PlainTextNode("This is test inside of a paragraph. "),
                            new PlainTextNode("It is also inside of a hierarchical section node. "),
                            new PlainTextNode("That's real neat-o."),
                        ]),
                    ],
                    new HeadingNode(new PlainTextNode("Section Heading")),
                ),
            ],
            "./test.md",
            "Sample Document",
        );

        const expected = [
            "# Sample Document",
            "",
            "This is a sample document. It has very basic content  ",
            "## Section Heading",
            "",
            "This is test inside of a paragraph. It is also inside of a hierarchical section node. That's real neat-o.  ",
            "",
        ].join(standardEOL);
        expect(markdownFromDocumentNode(document)).to.equal(expected);
    });
});
