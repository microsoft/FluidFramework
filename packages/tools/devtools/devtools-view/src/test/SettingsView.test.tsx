/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Normal usage pattern for @testing-library/jest-dom
// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import * as axe from "axe-core";
import { debug } from "jest-preview";
import React from "react";

import { SettingsView } from "../components/index.js";

const axeConfig = {
	rules: {
		"color-contrast": { enabled: true },
		"label": { enabled: true },
		"region": { enabled: false },
	},
};

describe.only("SettingsView Accessibility Check", () => {
	it("SettingsView is accessible", async () => {
		const { container } = render(<SettingsView />);
		const results = await axe.run(container, axeConfig);
		if (results.violations.length > 0) {
			console.log("Accessibility violations:", results.violations);
		}
		expect(results.violations.length).toBe(0);
	});

	it("Can tab/arrow navigate through the SettingsView", async () => {
		render(<SettingsView />);

		const user = userEvent.setup();
		// Focus on the first interactive element
		await user.tab();
		const dropdown = screen.getByRole("combobox", { name: /theme dropdown/i });
		expect(dropdown).toHaveFocus();
		// The dropdown theme options are divs but get compiled as buttons in the expect function and thus fail any expect calls.
		await user.keyboard("{Enter}");
		await user.tab();
		const privacyLink = screen.getByRole("link", { name: /microsoft privacy statement/i });
		expect(privacyLink).toHaveFocus();

		const usageToggle = screen.getByRole("switch", { name: /usage telemetry toggle/i });
		await user.tab();
		expect(usageToggle).toHaveFocus();
		debug();
	});
});
