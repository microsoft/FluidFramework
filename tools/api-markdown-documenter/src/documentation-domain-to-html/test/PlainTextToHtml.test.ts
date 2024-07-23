/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastNodes } from "hast";
import { PlainTextNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

describe("PlainText HTML rendering tests", () => {
	it("Empty text", () => {
		assertTransformation(PlainTextNode.Empty, { type: "text", value: "" });
	});

	it("Simple text", () => {
		assertTransformation(new PlainTextNode("This is some text!"), {
			type: "text",
			value: "This is some text!",
		});
	});

	it("HTML content (escaped: true)", () => {
		const input = new PlainTextNode("This is some <b>bold</b> text!", /* escaped: */ true);
		const expected: HastNodes = { type: "raw", value: "This is some <b>bold</b> text!" };
		assertTransformation(input, expected);
	});
});
