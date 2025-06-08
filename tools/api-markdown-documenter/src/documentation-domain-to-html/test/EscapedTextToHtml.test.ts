/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastTree } from "hast";

import { EscapedTextNode } from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

describe("EscapedText to HTML transformation tests", () => {
	it("Empty text", () => {
		assertTransformation(EscapedTextNode.Empty, { type: "raw", value: "" });
	});

	it("HTML content", () => {
		const input = new EscapedTextNode("This is some <b>bold</b> text!");
		const expected: HastTree = { type: "raw", value: "This is some <b>bold</b> text!" };
		assertTransformation(input, expected);
	});
});
