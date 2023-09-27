/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { ApiItemKind } from "@microsoft/api-extractor-model";
import {
	DocumentNode,
	HeadingNode,
	ParagraphNode,
	PlainTextNode,
	SectionNode,
	SpanNode,
} from "../../../documentation-domain";
import { renderDocument } from "../Render";

describe("Document HTML rendering tests", () => {
	it("Renders a simple document", () => {
		const document = new DocumentNode({
			documentItemMetadata: {
				apiItemName: "Foo-package",
				apiItemKind: ApiItemKind.Package,
				packageName: "Foo-package",
			},
			children: [
				new SectionNode(
					[
						new ParagraphNode([
							new PlainTextNode("This is a sample document. "),
							new PlainTextNode("It has very basic content.\t"),
						]),
						new SectionNode(
							[
								new ParagraphNode([
									new PlainTextNode("This is test inside of a paragraph. "),
									new PlainTextNode(
										"It is also inside of a hierarchical section node. ",
									),
									SpanNode.createFromPlainText("That's real neat-o.", {
										italic: true,
									}),
								]),
							],
							HeadingNode.createFromPlainText("Section Heading"),
						),
					],
					HeadingNode.createFromPlainText("Sample Document"),
				),
			],
			documentPath: "./test",
		});

		const expected = [
			"<!DOCTYPE html>",
			'<html lang="en">',
			"  <head>",
			'    <meta charset="utf-8" />',
			"  </head>",
			"  <body>",
			"    <section>",
			"      <h1>",
			"        Sample Document",
			"      </h1>",
			"      <p>",
			"        This is a sample document. It has very basic content.\t",
			"      </p>",
			"      <section>",
			"        <h2>",
			"          Section Heading",
			"        </h2>",
			"        <p>",
			"          This is test inside of a paragraph. It is also inside of a hierarchical section node. <span><i>That's real neat-o.</i></span>",
			"        </p>",
			"      </section>",
			"    </section>",
			"  </body>",
			"</html>",
			"",
		].join("\n");

		expect(renderDocument(document, {})).to.equal(expected);
	});
});
