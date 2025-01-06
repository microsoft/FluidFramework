/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { LinkNode, PlainTextNode } from "../../../documentation-domain/index.js";

import { testRender } from "./Utilities.js";

describe("Link Markdown rendering tests", () => {
	it("Can render a simple LinkNode", () => {
		const linkText = "Some Website";
		const linkTarget = "https://www.contoso.com";
		const result = testRender(new LinkNode([new PlainTextNode(linkText)], linkTarget));

		const expected = `[${linkText}](${linkTarget})`;
		expect(result).to.equal(expected);
	});
});
