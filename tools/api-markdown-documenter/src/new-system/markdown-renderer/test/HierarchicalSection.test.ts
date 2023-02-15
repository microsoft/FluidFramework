/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import {
	HeadingNode,
	HierarchicalSectionNode,
	HorizontalRuleNode,
	ParagraphNode,
} from "../../documentation-domain";
import { testRender } from "./Utilities";

describe("HierarchicalSectionNode markdown tests", () => {
	it("Simple section (Markdown)", () => {
		const input = new HierarchicalSectionNode(
			[
				ParagraphNode.createFromPlainText("Foo"),
				HorizontalRuleNode.Singleton,
				ParagraphNode.createFromPlainText("Bar"),
			],
			/* heading: */ HeadingNode.createFromPlainText("Hello World", /* id: */ "heading-id"),
		);

		const result = testRender(input);

		const expected = [
			"",
			"# Hello World {#heading-id}",
			"",
			"Foo",
			"",
			"---",
			"",
			"Bar",
			"",
			"",
		].join("\n");

		expect(result).to.equal(expected);
	});

	it("Simple section (HTML)", () => {
		const input = new HierarchicalSectionNode(
			[
				ParagraphNode.createFromPlainText("Foo"),
				HorizontalRuleNode.Singleton,
				ParagraphNode.createFromPlainText("Bar"),
			],
			/* heading: */ HeadingNode.createFromPlainText("Hello World", /* id: */ "heading-id"),
		);

		const result = testRender(input, undefined, { insideHtml: true });

		const expected = [
			"<section>",
			'  <h1 id="heading-id">',
			"    Hello World",
			"  </h1>",
			"  <p>",
			"    Foo",
			"  </p>",
			"  <hr>",
			"  <p>",
			"    Bar",
			"  </p>",
			"</section>",
			"",
		].join("\n");

		expect(result).to.equal(expected);
	});
});
