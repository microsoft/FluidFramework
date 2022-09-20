/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";
import { ParagraphNode } from "../../documentation-domain/ParagraphNode";
import { PlainTextNode } from "../../documentation-domain/PlainTextNode";
import { DocumentationNodeRenderer } from "../md-transformers";
import * as os from 'os';

describe("Paragraph markdown tests", () => {
    it("Creates a line break from an empty Paragraph", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.RenderNode(new ParagraphNode([]));
        expect(renderedForm).to.equal(os.EOL);
    }),

    it("Renders plain text nodes", () => {
        const node1 = new PlainTextNode('This is some text. ');
        const node2 = new PlainTextNode('This is more text!');
        const paragraph = new ParagraphNode([node1, node2])
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.RenderNode(paragraph);
        expect(renderedForm).to.equal(`This is some text. This is more text!${os.EOL}`);
    });
});
