/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { h } from "hastscript";

import { HeadingNode } from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

describe("HeadingNode -> Html", () => {
	it("With ID", () => {
		const input = HeadingNode.createFromPlainText("Foo", "foo-id");
		const expected = h("h1", { id: "foo-id" }, "Foo");
		assertTransformation(input, expected);
	});

	it("Without ID", () => {
		const input = HeadingNode.createFromPlainText("Foo");
		const expected = h("h1", "Foo");
		assertTransformation(input, expected);
	});

	it("Dynamic heading level (within limit)", () => {
		// Heading levels are dynamic depending on context (depth in the document tree).
		// Verify that the specified starting heading level in the config is respected when transforming the heading.
		const input = HeadingNode.createFromPlainText("Foo", "foo-id");
		const expected = h("h4", { id: "foo-id" }, "Foo");
		assertTransformation(input, expected, { startingHeadingLevel: 4 });
	});

	it("Dynamic heading level (beyond limit)", () => {
		// HTML supports heading levels 1-6.
		// As a policy, if we have a heading nested deeper than that, we transform the content to bold text with an
		// anchor tag above it.
		const input = HeadingNode.createFromPlainText("Foo", "foo-id");
		const expected = h(undefined, [h("a", { id: "foo-id" }), h("b", "Foo")]);
		assertTransformation(input, expected, { startingHeadingLevel: 7 });
	});
});
