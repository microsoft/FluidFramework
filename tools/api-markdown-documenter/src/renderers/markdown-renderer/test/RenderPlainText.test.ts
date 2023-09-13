/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { PlainTextNode } from "../../../documentation-domain";
import { RenderContext } from "../RenderContext";
import { testRender } from "./Utilities";

describe("PlainText rendering tests", () => {
	describe("Markdown", () => {
		it("Empty text", () => {
			expect(testRender(PlainTextNode.Empty)).to.equal("");
		});

		it("Simple text", () => {
			const text = `This is some text!`;
			expect(testRender(new PlainTextNode(text))).to.equal(text);
		});

		it("Italic text", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				italic: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(`_${text}_`);
		});

		it("Bold text", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				bold: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(`**${text}**`);
		});

		it("Strikethrough text", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				strikethrough: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(`~~${text}~~`);
		});

		it("Text with complex formatting", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				italic: true,
				bold: true,
				strikethrough: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(`**_~~${text}~~_**`);
		});
	});

	describe("HTML", () => {
		it("Empty text", () => {
			const context: Partial<RenderContext> = {
				insideHtml: true,
			};
			expect(testRender(PlainTextNode.Empty, context)).to.equal("");
		});

		it("Simple text", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				insideHtml: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(text);
		});

		it("Italic text", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				insideHtml: true,
				italic: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(`<i>${text}</i>`);
		});

		it("Bold text", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				insideHtml: true,
				bold: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(`<b>${text}</b>`);
		});

		it("Strikethrough text", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				insideHtml: true,
				strikethrough: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(`<s>${text}</s>`);
		});

		it("Text with complex formatting", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				insideHtml: true,
				italic: true,
				bold: true,
				strikethrough: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(
				`<b><i><s>${text}</s></i></b>`,
			);
		});
	});
});
