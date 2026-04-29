/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { cleanup, render, screen } from "@testing-library/react";

import { App } from "../../components/index.js";



describe("App Insights Example App UI test", () => {
	afterEach(() => {
	cleanup();
});

	it("App renders", async (): Promise<void> => {
		render(<App />);
		await screen.findByText("Loading Shared container...");
	});
});
