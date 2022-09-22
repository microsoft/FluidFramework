/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import {
    HeadingNode,
    HierarchicalSectionNode, //ParagraphNode,
    //PlainTextNode,
} from "../../documentation-domain";
import { DocumentationNodeRenderer } from "../md-transformers";

describe("HierarchicalSectionNode markdown tests", () => {
    it("Creates a hierarchical section with sensible default depth when none is provided", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new HierarchicalSectionNode([], HeadingNode.createFromPlainText("Heading")),
        );
        expect(renderedForm).to.equal(`## Heading`);
    });
});
