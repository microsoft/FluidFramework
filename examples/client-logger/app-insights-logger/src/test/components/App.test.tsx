/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { render, screen } from "@testing-library/react";
import React from "react";
import { App } from "../../components";

// TODO: update ESM configuration and re-enable test
describe("App Insights Example App UI test", () => {
	xit("App renders", async (): Promise<void> => {
		render(<App />);
		await screen.findByText("Loading Shared container...");
	});
});
