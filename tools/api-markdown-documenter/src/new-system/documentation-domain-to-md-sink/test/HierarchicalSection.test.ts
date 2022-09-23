/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { HeadingNode, HierarchicalSectionNode, PlainTextNode } from "../../documentation-domain";
import { DocumentationNodeRenderer } from "../md-transformers";
import { standardEOL } from "../md-transformers/Utilities";

describe("HierarchicalSectionNode markdown tests", () => {
    it("Creates a hierarchical section with sensible default depth when none is provided", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new HierarchicalSectionNode([], HeadingNode.createFromPlainText("Heading")),
        );
        expect(renderedForm).to.equal(`## Heading${standardEOL}${standardEOL}`);
    });

    it("Can render child content beneath a heading", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new HierarchicalSectionNode(
                [
                    new PlainTextNode("This is some content text. "),
                    new PlainTextNode("This is more content text."),
                ],
                HeadingNode.createFromPlainText("Heading"),
            ),
        );
        expect(renderedForm).to.equal(
            `## Heading${standardEOL}${standardEOL}This is some content text. This is more content text.${standardEOL}`,
        );
    });

    it("Increases the heading level of nested sections, to a limited point", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new HierarchicalSectionNode(
                [
                    new PlainTextNode("Section 1"),
                    new HierarchicalSectionNode(
                        [
                            new PlainTextNode("Section 2"),
                            new HierarchicalSectionNode(
                                [
                                    new PlainTextNode("Section 3"),
                                    new HierarchicalSectionNode(
                                        [
                                            new PlainTextNode("Section 4"),
                                            new HierarchicalSectionNode(
                                                [
                                                    new PlainTextNode("Section 5"),
                                                    new HierarchicalSectionNode(
                                                        [new PlainTextNode("Section 6")],
                                                        HeadingNode.createFromPlainText(
                                                            "Heading 6",
                                                        ),
                                                    ),
                                                ],
                                                HeadingNode.createFromPlainText("Heading 5"),
                                            ),
                                        ],
                                        HeadingNode.createFromPlainText("Heading 4"),
                                    ),
                                ],
                                HeadingNode.createFromPlainText("Heading 3"),
                            ),
                        ],
                        HeadingNode.createFromPlainText("Heading 2"),
                    ),
                ],
                HeadingNode.createFromPlainText("Heading 1"),
            ),
        );
        const expectedOutput = [
            "## Heading 1",
            "",
            "Section 1",
            "",
            "### Heading 2",
            "",
            "Section 2",
            "",
            "### Heading 3",
            "",
            "Section 3",
            "",
            "#### Heading 4",
            "",
            "Section 4",
            "",
            "#### Heading 5",
            "",
            "Section 5",
            "",
            "#### Heading 6",
            "",
            "Section 6",
            "",
        ].join(standardEOL);
        expect(renderedForm).to.equal(expectedOutput);
    });
});
