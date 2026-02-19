/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import React from "react";

import { SettingsView } from "../components/index.js";

import { assertNoAccessibilityViolations } from "./utils/index.js";

describe("SettingsView Accessibility Check", () => {
	it("SettingsView is accessible", async () => {
		const { container } = render(<SettingsView />);
		await assertNoAccessibilityViolations(container);
	});

	it("Can tab/arrow navigate through the SettingsView", async () => {
		render(<SettingsView />);

		const user = userEvent.setup();
		// Focus on the first interactive element (dropdown theme selector)
		await user.tab();
		const dropdown = screen.getByRole("combobox", { name: /Theme Selection Dropdown/ });
		expect(dropdown).toHaveFocus();
		// The dropdown theme options are divs but get compiled as buttons in the expect function and thus fail any expect calls.
		await user.tab();
		const privacyLink = screen.getByRole("link", { name: /Microsoft Privacy Statement/ });
		expect(privacyLink).toHaveFocus();

		const usageToggle = screen.getByRole("switch", { name: /Usage Telemetry Toggle/ });
		await user.tab();
		expect(usageToggle).toHaveFocus();
		// The usage toggle is a switch and can be toggled by pressing the space bar
		await user.keyboard(" ");
		expect(usageToggle).toBeChecked();
	});
});
