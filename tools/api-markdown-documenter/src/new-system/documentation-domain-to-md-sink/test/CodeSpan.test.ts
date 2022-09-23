/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import {
    CodeSpanNode,
    PlainTextNode,
    TableCellNode,
    TableNode,
    TableRowNode,
} from "../../documentation-domain";
import { DocumentationNodeRenderer } from "../md-transformers";
import { standardEOL } from "../md-transformers/Utilities";

describe("CodeSpan markdown tests", () => {
    it("Can render a simple CodeSpan", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new CodeSpanNode([new PlainTextNode("console.log('hello world');")]),
        );
        expect(renderedForm).to.equal("`console.log('hello world');`");
    });

    it("Should render using HTML tags when inside a table", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new TableNode(
                [
                    new TableRowNode([
                        new TableCellNode([new PlainTextNode("Javascript")]),
                        new TableCellNode([
                            new CodeSpanNode([new PlainTextNode("console.log('hello world');")]),
                        ]),
                    ]),
                    new TableRowNode([
                        new TableCellNode([new PlainTextNode("C")]),
                        new TableCellNode([
                            new CodeSpanNode([new PlainTextNode(`printf("hello world");`)]),
                        ]),
                    ]),
                ],
                new TableRowNode([
                    new TableCellNode([new PlainTextNode("Language")]),
                    new TableCellNode([new PlainTextNode("Code")]),
                ]),
            ),
        );
        const expected = [
            "",
            "| Language | Code |",
            "|  --- | --- |",
            "|  Javascript | <code>console.log('hello world');</code> |",
            "|  C | <code>printf(&quot;hello world&quot;);</code> |", // The C-style code uses double quotes (" "), which need to be escaped when inside a table
            "",
        ].join(standardEOL);
        expect(renderedForm).to.equal(expected);
    });
});
