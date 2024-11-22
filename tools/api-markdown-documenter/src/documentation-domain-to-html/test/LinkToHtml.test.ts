/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { h } from "hastscript";

import { LinkNode, PlainTextNode } from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

describe("Link HTML rendering tests", () => {
	it("Can render a simple LinkNode", () => {
		const linkText = "Some Website";
		const linkTarget = "https://www.bing.com";
		const input = new LinkNode([new PlainTextNode(linkText)], linkTarget);

		const expected = h("a", { href: linkTarget }, [{ type: "text", value: linkText }]);
		assertTransformation(input, expected);
	});
});
