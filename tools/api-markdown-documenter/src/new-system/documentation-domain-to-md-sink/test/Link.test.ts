/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { LinkNode, PlainTextNode } from "../../documentation-domain";
import { DocumentationNodeRenderer } from "../md-transformers";

describe("Link markdown tests", () => {
    it("Can render a simple LinkNode", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new LinkNode([new PlainTextNode("Some Website")], "https://www.contoso.com"),
        );
        expect(renderedForm).to.equal("[Some Website](https://www.contoso.com)");
    });
});
