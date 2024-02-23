/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

// eslint-disable-next-line import/no-internal-modules
import { coreErrorMessage, docsLinkUrl, NoDevtoolsErrorBar } from "../components/index.js";

describe("NoDevtoolsErrorBar component tests", () => {
	it("Displays expected text and contains expected link", async (): Promise<void> => {
		render(<NoDevtoolsErrorBar dismiss={(): void => {}} retrySearch={(): void => {}} />);

		await screen.findByText(coreErrorMessage); // Will throw if exact text not found

		const helpLink = await screen.findByRole("link");
		expect(helpLink).toHaveTextContent("documentation page");
		expect(helpLink).toHaveAttribute("href", docsLinkUrl);
	});

	it("Clicking close button invokes `dismiss`", async (): Promise<void> => {
		const userEvent = await import("@testing-library/user-event");
		const dismiss = jest.fn();
		render(<NoDevtoolsErrorBar dismiss={dismiss} retrySearch={(): void => {}} />);

		const dismissButton = await screen.findByRole("button"); // Dismiss button is first button rendered
		await userEvent.userEvent.click(dismissButton);
		expect(dismiss).toHaveBeenCalled();
	});

	it("Clicking retry button invokes `retrySearch`", async (): Promise<void> => {
		const userEvent = await import("@testing-library/user-event");
		const retrySearch = jest.fn();
		render(<NoDevtoolsErrorBar dismiss={(): void => {}} retrySearch={retrySearch} />);

		const retrySearchButton = await screen.findByTestId("retry-search-button");
		await userEvent.userEvent.click(retrySearchButton);
		expect(retrySearch).toHaveBeenCalled();
	});
});
