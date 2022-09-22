/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { OrderedListNode, PlainTextNode } from "../../documentation-domain";
import { DocumentationNodeRenderer } from "../md-transformers";
import { standardEOL } from "../md-transformers/Utilities";

describe("OrderedList markdown tests", () => {
    it("Does nothing with an empty list", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(new OrderedListNode([]));
        expect(renderedForm).to.equal(``);
    });

    it("Creates an ordered list from content elements", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new OrderedListNode([
                new PlainTextNode("Item 1"),
                new PlainTextNode("Item 2"),
                new PlainTextNode("Item 3"),
            ]),
        );
        const expected = ["1. Item 1", "2. Item 2", "3. Item 3"].join(standardEOL);
        expect(renderedForm).to.equal(expected);
    });
});
