/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { LinkNode, PlainTextNode } from "../../documentation-domain";
import { testRender } from "./Utilities";

describe("Link rendering tests", () => {
	it("Can render a simple LinkNode (Markdown)", () => {
		const linkText = "Some Website";
		const linkTarget = "https://www.contoso.com";
		const result = testRender(new LinkNode([new PlainTextNode(linkText)], linkTarget));

		const expected = `[${linkText}](${linkTarget})`;
		expect(result).to.equal(expected);
	});

	it("Can render a simple LinkNode (HTML)", () => {
		const linkText = "Some Website";
		const linkTarget = "https://www.contoso.com";
		const result = testRender(new LinkNode([new PlainTextNode(linkText)], linkTarget), {
			insideHtml: true,
		});

		const expected = `<a href='${linkTarget}'>${linkText}</a>`;
		expect(result).to.equal(expected);
	});
});
