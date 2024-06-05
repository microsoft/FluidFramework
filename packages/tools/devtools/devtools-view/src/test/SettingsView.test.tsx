/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Normal usage pattern for @testing-library/jest-dom
// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as axe from "axe-core";
import React from "react";

import { SettingsView } from "../components/index.js";

describe("SettingsView Accessibility Check", () => {
	it("SettingsView is accessible", async () => {
		const { container } = render(<SettingsView />);
		const results = await axe.run(container);
		if (results.violations.length > 0) {
			console.log("Accessibility violations:", results.violations);
		}
		expect(results.violations.length).toBe(0);
	});

	it("Can tab/arrow navigate through the SettingsView", async () => {
		render(<SettingsView />);
		const user = userEvent.setup();

		// Focus on the first interactive element
		// userEvent.tab();
		// expect(screen.getByText("Theme").closest("div")).toHaveFocus();

		// Tab to the Dropdown
		await user.tab();
		// expect(screen.getByRole("combobox")).toHaveFocus();

		// // Open the dropdown and use arrow keys to navigate options
		// userEvent.keyboard("{ArrowDown}");
		// expect(screen.getByText("Light")).toHaveFocus();
		// userEvent.keyboard("{ArrowDown}");
		// expect(screen.getByText("Dark")).toHaveFocus();
		// userEvent.keyboard("{ArrowDown}");
		// expect(screen.getByText("High Contrast")).toHaveFocus();

		// // Tab to the next section header
		// userEvent.tab();
		// expect(screen.getByText("Usage telemetry").closest("div")).toHaveFocus();

		// // Tab to the link
		// userEvent.tab();
		// expect(screen.getByRole("link", { name: "Microsoft Privacy Statement" })).toHaveFocus();

		// // Tab to the switch
		// userEvent.tab();
		// expect(screen.getByRole("checkbox")).toHaveFocus();
	});
});
