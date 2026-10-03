/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { AudienceStateTable } from "../components/index.js";

import { assertNoAccessibilityViolations } from "./utils/index.js";

describe("AudienceStateTable Accessibility Check", () => {
	it("AudienceStateTable is accessible", async () => {
		const { container } = render(<AudienceStateTable audienceStateItems={[]} />);
		await assertNoAccessibilityViolations(container);
	});

	it("Defines column headers using native table semantics", () => {
		render(<AudienceStateTable audienceStateItems={[]} />);

		const expectedColumnNames = ["Client ID", "User ID", "Mode", "Scopes"];
		const columnHeaders = screen.getAllByRole("columnheader");
		assert.equal(columnHeaders.length, expectedColumnNames.length);

		for (const [index, columnHeader] of columnHeaders.entries()) {
			assert.equal(columnHeader.tagName, "TH");
			assert.equal(columnHeader.getAttribute("scope"), "col");
			assert.match(
				columnHeader.textContent ?? "",
				new RegExp(expectedColumnNames[index], "i"),
			);
		}
	});

	it("Can tab/arrow navigate through the AudienceStateTable", async () => {
		render(<AudienceStateTable audienceStateItems={[]} />);

		const user = userEvent.setup();
		await user.tab();
		const clientIDTooltip = screen.getByRole("button", { name: /client id/i });
		assert.equal(document.activeElement, clientIDTooltip);
		await user.tab();
		const userIDTooltip = screen.getByRole("button", { name: /user id/i });
		assert.equal(document.activeElement, userIDTooltip);
		await user.tab();
		const modeTooltip = screen.getByRole("button", { name: /mode/i });
		assert.equal(document.activeElement, modeTooltip);
		await user.tab();
		const scopesTooltip = screen.getByRole("button", { name: /scopes/i });
		assert.equal(document.activeElement, scopesTooltip);
	});
});
