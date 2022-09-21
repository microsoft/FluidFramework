/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { PlainTextNode } from "../../documentation-domain/PlainTextNode";
import { DocumentationNodeRenderer } from "../md-transformers";

describe("PlainText markdown tests", () => {
    it("Renders nothing when given an empty plain text node", () => {
        const emptyNode = new PlainTextNode("");
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(emptyNode);
        expect(renderedForm).to.equal("");
    }),
        it("Renders text when given text", () => {
            const expectedString = `this is some text`;
            const contentNode = new PlainTextNode(expectedString);
            const renderer = new DocumentationNodeRenderer();
            const renderedForm = renderer.renderNode(contentNode);
            expect(renderedForm).to.equal(expectedString);
        });
});
