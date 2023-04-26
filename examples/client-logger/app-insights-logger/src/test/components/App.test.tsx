/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-unassigned-import
import { render, screen } from "@testing-library/react";
import React from "react";
import { App } from "../../components";

describe("App Insights Example App UI test", () => {
	it("App renders", async (): Promise<void> => {
		render(<App />);
		await screen.findByText("Loading Shared container...");
	});
});
