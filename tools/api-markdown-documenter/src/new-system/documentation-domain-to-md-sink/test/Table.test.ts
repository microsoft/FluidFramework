/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { PlainTextNode, TableCellNode, TableNode, TableRowNode } from "../../documentation-domain";
import { DocumentationNodeRenderer } from "../md-transformers";
import { standardEOL } from "../md-transformers/Utilities";

describe("Table markdown tests", () => {
    it("Can render a table row, and includes a default heading row when none is supplied", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new TableNode([
                new TableRowNode([
                    new TableCellNode([new PlainTextNode("Cell 1")]),
                    new TableCellNode([new PlainTextNode("Cell 2")]),
                    new TableCellNode([new PlainTextNode("Cell 3")]),
                ]),
            ]),
        );
        const expected = [
            "",
            "|  |  |  |",
            "|  --- | --- | --- |",
            "|  Cell 1 | Cell 2 | Cell 3 |",
            "",
        ].join(standardEOL);
        expect(renderedForm).to.equal(expected);
    });

    it("Can render a table header row", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new TableNode(
                [
                    new TableRowNode([
                        new TableCellNode([new PlainTextNode("Cell 1")]),
                        new TableCellNode([new PlainTextNode("Cell 2")]),
                        new TableCellNode([new PlainTextNode("Cell 3")]),
                    ]),
                ],
                new TableRowNode([
                    new TableCellNode([new PlainTextNode("Heading 1")]),
                    new TableCellNode([new PlainTextNode("Heading 2")]),
                    new TableCellNode([new PlainTextNode("Heading 3")]),
                ]),
            ),
        );
        const expected = [
            "",
            "| Heading 1 | Heading 2 | Heading 3 |",
            "|  --- | --- | --- |",
            "|  Cell 1 | Cell 2 | Cell 3 |",
            "",
        ].join(standardEOL);
        expect(renderedForm).to.equal(expected);
    });
});
