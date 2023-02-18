/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { AlertKind, AlertNode, PlainTextNode } from "../../documentation-domain";
import { testRender } from "./Utilities";

describe("Alert rendering tests", () => {
	describe("Markdown", () => {
		it("Can render an alert with a title", () => {
			const alertNode = new AlertNode(
				[
					new PlainTextNode("This is a test of the AlertNode rendering system. "),
					new PlainTextNode(
						"If this were a real alert, more information would follow this message.",
					),
				],
				AlertKind.Warning,
				/* title: */ "This is a test",
			);
			const result = testRender(alertNode);

			const expected = [
				"",
				"> **\\[Warning\\]: This is a test**",
				"> ",
				"> This is a test of the AlertNode rendering system. If this were a real alert, more information would follow this message.",
				"",
				"",
			].join("\n");

			expect(result).to.equal(expected);
		});

		it("Can render an alert without a title", () => {
			const alertNode = new AlertNode(
				[new PlainTextNode("PRO TIP: Unit tests are awesome!")],
				AlertKind.Tip,
			);
			const result = testRender(alertNode);

			const expected = [
				"",
				"> **\\[Tip\\]**",
				"> ",
				"> PRO TIP: Unit tests are awesome!",
				"",
				"",
			].join("\n");

			expect(result).to.equal(expected);
		});
	});

	describe("HTML", () => {
		it("Can render an alert with a title", () => {
			const input = new AlertNode(
				[
					new PlainTextNode("This is a test of the AlertNode rendering system. "),
					new PlainTextNode(
						"If this were a real alert, more information would follow this message.",
					),
				],
				AlertKind.Warning,
				/* title: */ "This is a test",
			);
			const result = testRender(input, { insideHtml: true });

			const expected = [
				"<blockquote>",
				"  <b>[Warning]: This is a test</b>",
				"  <br>",
				"  <br>",
				"  This is a test of the AlertNode rendering system. If this were a real alert, more information would follow this message.",
				"</blockquote>",
				"",
			].join("\n");

			expect(result).to.equal(expected);
		});

		it("Can render an alert without a title", () => {
			const input = new AlertNode(
				[new PlainTextNode("PRO TIP: Unit tests are awesome!")],
				AlertKind.Tip,
			);
			const result = testRender(input, { insideHtml: true });

			const expected = [
				"<blockquote>",
				"  <b>[Tip]</b>",
				"  <br>",
				"  <br>",
				"  PRO TIP: Unit tests are awesome!",
				"</blockquote>",
				"",
			].join("\n");

			expect(result).to.equal(expected);
		});
	});
});
