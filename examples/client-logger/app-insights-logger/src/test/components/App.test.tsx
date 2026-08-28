/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { render, screen } from "@testing-library/react";

import { App } from "../../components/index.js";

describe("App Insights Example App UI test", () => {
	it("App renders", async (): Promise<void> => {
		const getContainerInfo = async (): Promise<never> => new Promise(() => {});
		const { unmount } = render(<App getContainerInfo={getContainerInfo} />);
		try {
			await screen.findByText("Loading Shared container...");
		} finally {
			unmount();
		}
	});
});
