/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import type { SectionHeading } from "../../mdast/index.js";
import { createTransformationContext } from "../TransformationContext.js";

describe("headingToMarkdown", () => {
	describe("Heading level within Markdown-supported range", () => {
		const transformationContext = createTransformationContext({ startingHeadingLevel: 2 });

		it("Without ID", () => {
			const input: SectionHeading = {
				type: "sectionHeading",
				title: "Hello world!",
			};
			const result = transformationContext.transformations.sectionHeading(
				input,
				transformationContext,
			);
			expect(result).to.deep.equal([
				{
					type: "heading",
					depth: 2,
					children: [{ type: "text", value: "Hello world!" }],
				},
			]);
		});

		it("With ID", () => {
			const input: SectionHeading = {
				type: "sectionHeading",
				title: "Hello world!",
				id: "my-heading-id",
			};
			const result = transformationContext.transformations.sectionHeading(
				input,
				transformationContext,
			);
			expect(result).to.deep.equal([
				{
					type: "heading",
					depth: 2,
					children: [{ type: "text", value: "Hello world! {#my-heading-id}" }],
				},
			]);
		});
	});

	describe("Heading level beyond Markdown-supported range", () => {
		// Markdown supports headings up to level 6, so starting at 7 will result in special handling.
		const transformationContext = createTransformationContext({ startingHeadingLevel: 7 });

		it("Without ID", () => {
			const input: SectionHeading = {
				type: "sectionHeading",
				title: "Hello world!",
			};
			const result = transformationContext.transformations.sectionHeading(
				input,
				transformationContext,
			);
			expect(result).to.deep.equal([
				{
					type: "paragraph",
					children: [
						{
							type: "strong",
							children: [{ type: "text", value: "Hello world!" }],
						},
					],
				},
			]);
		});

		it("With ID", () => {
			const input: SectionHeading = {
				type: "sectionHeading",
				title: "Hello world!",
				id: "my-heading-id",
			};
			const result = transformationContext.transformations.sectionHeading(
				input,
				transformationContext,
			);
			expect(result).to.deep.equal([
				{
					type: "paragraph",
					children: [
						{ type: "html", value: `<a id="my-heading-id"></a>` },
						{ type: "break" },
						{
							type: "strong",
							children: [{ type: "text", value: "Hello world!" }],
						},
					],
				},
			]);
		});
	});
});
