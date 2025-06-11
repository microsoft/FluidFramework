/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PlainTextNode } from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

describe("PlainText to HTML transformation tests", () => {
	it("Empty text", () => {
		assertTransformation(PlainTextNode.Empty, { type: "text", value: "" });
	});

	it("Simple text", () => {
		assertTransformation(new PlainTextNode("This is some text!"), {
			type: "text",
			value: "This is some text!",
		});
	});
});
