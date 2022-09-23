/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { AlertKind, AlertNode, PlainTextNode } from "../../documentation-domain";
import { DocumentationNodeRenderer } from "../md-transformers";
import { standardEOL } from "../md-transformers/Utilities";

describe("Alert markdown tests", () => {
    it("Can render a simple alert", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new AlertNode(
                [
                    new PlainTextNode("This is a test of the AlertNode rendering system. "),
                    new PlainTextNode(
                        "If this were a real alert, more information would follow this message.",
                    ),
                ],
                AlertKind.Warning,
                "This is a test",
            ),
        );
        const expectedOutput = [
            "",
            "> <bold> [Warning]: This is a test </bold>",
            "> ",
            "> This is a test of the AlertNode rendering system. If this were a real alert, more information would follow this message.",
            "",
        ].join(standardEOL);
        expect(renderedForm).to.equal(expectedOutput);
    });
    it("Can render an alert without a title", () => {
        const renderer = new DocumentationNodeRenderer();
        const renderedForm = renderer.renderNode(
            new AlertNode([new PlainTextNode("PRO TIP: Unit tests are awesome!")], AlertKind.Tip),
        );
        const expectedOutput = [
            "",
            "> <bold> [Tip] </bold>",
            "> ",
            "> PRO TIP: Unit tests are awesome!",
            "",
        ].join(standardEOL);
        expect(renderedForm).to.equal(expectedOutput);
    });
});
