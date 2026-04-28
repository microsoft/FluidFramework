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

	it("Can tab/arrow navigate through the AudienceStateTable", async () => {
		render(<AudienceStateTable audienceStateItems={[]} />);

		const user = userEvent.setup();
		await user.tab();
		const clientIDTooltip = screen.getByRole("button", { name: /client id/i });
		assert.strictEqual(document.activeElement, clientIDTooltip);
		await user.tab();
		const userIDTooltip = screen.getByRole("button", { name: /user id/i });
		assert.strictEqual(document.activeElement, userIDTooltip);
		await user.tab();
		const modeTooltip = screen.getByRole("button", { name: /mode/i });
		assert.strictEqual(document.activeElement, modeTooltip);
		await user.tab();
		const scopesTooltip = screen.getByRole("button", { name: /scopes/i });
		assert.strictEqual(document.activeElement, scopesTooltip);
	});
});
