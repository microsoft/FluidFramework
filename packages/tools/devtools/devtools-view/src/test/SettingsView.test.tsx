/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Normal usage pattern for @testing-library/jest-dom
// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
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
});
