/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { PlainTextNode } from "../../../documentation-domain";
import { type RenderContext } from "../RenderContext";
import { testRender } from "./Utilities";

describe("PlainText HTML rendering tests", () => {
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
		expect(testRender(new PlainTextNode(text), context)).to.equal(`<i>${text}</i>`);
	});

	it("Bold text", () => {
		const text = `This is some text!`;
		const context: Partial<RenderContext> = {
			bold: true,
		};
		expect(testRender(new PlainTextNode(text), context)).to.equal(`<b>${text}</b>`);
	});

	it("Strikethrough text", () => {
		const text = `This is some text!`;
		const context: Partial<RenderContext> = {
			strikethrough: true,
		};
		expect(testRender(new PlainTextNode(text), context)).to.equal(`<s>${text}</s>`);
	});

	it("Text with complex formatting", () => {
		const text = `This is some text!`;
		const context: Partial<RenderContext> = {
			italic: true,
			bold: true,
			strikethrough: true,
		};
		expect(testRender(new PlainTextNode(text), context)).to.equal(
			`<b><i><s>${text}</s></i></b>`,
		);
	});
});
