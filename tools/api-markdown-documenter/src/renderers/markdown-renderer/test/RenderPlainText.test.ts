/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { PlainTextNode } from "../../../documentation-domain";
import { type RenderContext } from "../RenderContext";
import { testRender } from "./Utilities";

describe("PlainText Markdown rendering tests", () => {
	describe("Standard context", () => {
		it("Empty text", () => {
			expect(testRender(PlainTextNode.Empty)).to.equal("");
		});

		it("No formatting", () => {
			const text = `This is some text!`;
			expect(testRender(new PlainTextNode(text))).to.equal(text);
		});

		it("Italic", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				italic: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(`_${text}_`);
		});

		it("Bold", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				bold: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(`**${text}**`);
		});

		it("Strikethrough", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				strikethrough: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(`~~${text}~~`);
		});

		it("Mixed formatting", () => {
			const text = `This is some text!`;
			const context: Partial<RenderContext> = {
				italic: true,
				bold: true,
				strikethrough: true,
			};
			expect(testRender(new PlainTextNode(text), context)).to.equal(`**_~~${text}~~_**`);
		});
	});

	// TODO: test `insideCodeBlock` context
});
