/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import React from "react";

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
		expect(clientIDTooltip).toHaveFocus();
		await user.tab();
		const userIDTooltip = screen.getByRole("button", { name: /user id/i });
		expect(userIDTooltip).toHaveFocus();
		await user.tab();
		const modeTooltip = screen.getByRole("button", { name: /mode/i });
		expect(modeTooltip).toHaveFocus();
		await user.tab();
		const scopesTooltip = screen.getByRole("button", { name: /scopes/i });
		expect(scopesTooltip).toHaveFocus();
	});
});
