/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { HeadingNode } from "../../../documentation-domain/index.js";
import { testRender } from "./Utilities.js";

describe("Heading Markdown rendering tests", () => {
	describe("Standard context", () => {
		it("Without ID", () => {
			const input = HeadingNode.createFromPlainText("Hello World");
			const result = testRender(input);
			const expected = ["", "# Hello World", "", ""].join("\n");
			expect(result).to.equal(expected);
		});

		it("With ID", () => {
			const input = HeadingNode.createFromPlainText("Hello World", /* id: */ "heading-id");
			const result = testRender(input);
			const expected = ["", "# Hello World {#heading-id}", "", ""].join("\n");
			expect(result).to.equal(expected);
		});

		it("With ID - includes content that must be escaped for Markdown", () => {
			const input = HeadingNode.createFromPlainText("Hello World", /* id: */ "_heading-id_");
			const result = testRender(input);
			const expected = ["", "# Hello World {#\\_heading-id\\_}", "", ""].join("\n");
			expect(result).to.equal(expected);
		});

		it("Without ID (beyond max heading level)", () => {
			const input = HeadingNode.createFromPlainText("Hello World");
			const result = testRender(input, { headingLevel: 7 });
			const expected = ["", "**Hello World**", "", ""].join("\n");
			expect(result).to.equal(expected);
		});

		it("With ID (beyond max heading level)", () => {
			const input = HeadingNode.createFromPlainText("Hello World", /* id: */ "heading-id");
			const result = testRender(input, { headingLevel: 7 });
			const expected = ["", '<a id="heading-id"></a>', "**Hello World**", "", ""].join("\n");
			expect(result).to.equal(expected);
		});
	});

	describe("Table context", () => {
		it("Without ID", () => {
			const input = HeadingNode.createFromPlainText("Hello World");
			const result = testRender(input, { insideTable: true });
			const expected = ["<h1>Hello World</h1>"].join("\n");
			expect(result).to.equal(expected);
		});

		it("With ID", () => {
			const input = HeadingNode.createFromPlainText("Hello World", /* id: */ "heading-id");
			const result = testRender(input, { insideTable: true });
			const expected = ['<h1 id="heading-id">Hello World</h1>'].join("\n");
			expect(result).to.equal(expected);
		});

		it("With ID - includes content that would be escaped in Markdown", () => {
			const input = HeadingNode.createFromPlainText("Hello World", /* id: */ "_heading-id_");
			const result = testRender(input, { insideTable: true });
			const expected = ['<h1 id="_heading-id_">Hello World</h1>'].join("\n");
			expect(result).to.equal(expected);
		});
	});
});
