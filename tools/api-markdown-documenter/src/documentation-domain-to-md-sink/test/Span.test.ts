/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";
import { SpanNode } from "../../documentation-domain";
import { PlainTextNode } from "../../documentation-domain/PlainTextNode";
import { DocumentationNodeRenderer } from "../md-transformers";

describe("Span markdown tests", () => {
    it("Renders nothing in an empty span", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(new SpanNode([]));
        expect(renderedForm).to.equal(``);
    }),

    it("Renders plain text nodes", () => {
        const node1 = new PlainTextNode('This is some text. ');
        const node2 = new PlainTextNode('This is more text!');
        const span = new SpanNode([node1, node2])
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(span);
        expect(renderedForm).to.equal(`This is some text. This is more text!`);
    });

    describe("Span text style tests", () => {
        for(let testConfig of [{style: 'bold', expectedString: '**'}, {style: 'italic', expectedString: '__'}, {style: 'strikethrough', expectedString: '~~'}]) {
            it(`Renders ${testConfig.style} text`, () => {
                const text = new PlainTextNode('This is some emphasized text!');
                const spanStyle = {};
                spanStyle[testConfig.style] = true;
                const span = new SpanNode([text], spanStyle);
                const renderer = new DocumentationNodeRenderer();
                const renderedForm = renderer.renderNode(span);
                expect(renderedForm).to.equal(`${testConfig.expectedString}This is some emphasized text!${testConfig.expectedString}`);
            });
            it(`Does not overemphasize ${testConfig.style} text`, () => {
                const firstTextNode = new PlainTextNode('This text (');
                const overemphasizedTextNode = new PlainTextNode('THIS RIGHT HERE!');
                const secondTextNode = new PlainTextNode(') has redundant emphasis');

                const innerSpanStyle = {};
                innerSpanStyle[testConfig.style] = true;
                const innerSpan = new SpanNode([overemphasizedTextNode], innerSpanStyle);
                const rootSpanStyle = {};
                rootSpanStyle[testConfig.style] = true;
                const rootSpan = new SpanNode([firstTextNode, innerSpan, secondTextNode], rootSpanStyle);
                const renderer = new DocumentationNodeRenderer();
                const renderedForm = renderer.renderNode(rootSpan);
                expect(renderedForm).to.equal(`${testConfig.expectedString}This text (THIS RIGHT HERE!) has redundant emphasis${testConfig.expectedString}`);
            });
        }
    })
});
