/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { CodeSpanNode, PlainTextNode } from "../../documentation-domain";
import { testRender } from "./Utilities";

describe("CodeSpan rendering tests", () => {
	describe("Markdown", () => {
		it("Empty CodeSpan", () => {
			expect(testRender(CodeSpanNode.Empty)).to.equal("``");
		});

		it("Simple CodeSpan", () => {
			const codeSpanNode = new CodeSpanNode([
				new PlainTextNode("console.log('hello world');"),
			]);
			const result = testRender(codeSpanNode);

			const expected = "`console.log('hello world');`";

			expect(result).to.equal(expected);
		});
	});

	describe("HTML", () => {
		it("Empty CodeSpan", () => {
			expect(testRender(CodeSpanNode.Empty, { insideHtml: true })).to.equal("<code></code>");
		});

		it("Simple CodeSpan", () => {
			const codeSpanNode = new CodeSpanNode([
				new PlainTextNode("console.log('hello world');"),
			]);
			const result = testRender(codeSpanNode, { insideHtml: true });

			const expected = "<code>console.log('hello world');</code>";

			expect(result).to.equal(expected);
		});
	});
});
