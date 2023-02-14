/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { PlainTextNode } from "../../documentation-domain";
import { MarkdownRenderContext } from "../RenderContext";
import { testRender } from "./Utilities";

describe("PlainText markdown tests", () => {
	describe("Markdown", () => {
		it("Empty text", () => {
			expect(testRender(PlainTextNode.Empty)).to.equal("");
		});
		it("Simple text", () => {
			const text = `This is some text!`;
			expect(testRender(new PlainTextNode(text))).to.equal(text);
		});
	});

	describe("HTML", () => {
		const customContext: Partial<MarkdownRenderContext> = {
			insideHtml: true,
		};
		it("Empty text", () => {
			expect(testRender(PlainTextNode.Empty, undefined, customContext)).to.equal("");
		});
		it("Simple text", () => {
			const text = `This is some text!`;
			expect(testRender(new PlainTextNode(text), undefined, customContext)).to.equal(text);
		});
	});
});
