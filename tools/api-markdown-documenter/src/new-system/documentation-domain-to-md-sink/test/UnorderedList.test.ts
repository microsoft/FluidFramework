/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { PlainTextNode, UnorderedListNode } from "../../documentation-domain";
import { DocumentationNodeRenderer } from "../md-transformers";
import { standardEOL } from "../md-transformers/Utilities";

describe("UnorderedListNode markdown tests", () => {
    it("Does nothing with an empty list", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(new UnorderedListNode([]));
        expect(renderedForm).to.equal(`\n`);
    });

    it("Creates an unordered list from content elements", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new UnorderedListNode([
                new PlainTextNode("Item 1"),
                new PlainTextNode("Item 2"),
                new PlainTextNode("Item 3"),
            ]),
        );
        const expected = ["- Item 1", "- Item 2", "- Item 3", "", ""].join(standardEOL);
        expect(renderedForm).to.equal(expected);
    });
});
