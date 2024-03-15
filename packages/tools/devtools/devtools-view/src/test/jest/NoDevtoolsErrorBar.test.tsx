/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

// eslint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
// @testing-library/user-event is CommonJs and better imported in an affirmed CJS module (.cts)
// but ts-jest has not addressed https://github.com/kulshekhar/ts-jest/issues/3996 transpiling
// .cts files AND fluentui does not have proper ESM support in their dual-emit packages (see
// https://github.com/microsoft/fluentui/issues/30778). So just expect this is transpiled in
// CJS context which doesn't require explicit .cts file.
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";

import { coreErrorMessage, docsLinkUrl, NoDevtoolsErrorBar } from "../../components/index.js";

describe("NoDevtoolsErrorBar component tests", () => {
	it("Displays expected text and contains expected link", async (): Promise<void> => {
		render(<NoDevtoolsErrorBar dismiss={(): void => {}} retrySearch={(): void => {}} />);

		await screen.findByText(coreErrorMessage); // Will throw if exact text not found

		const helpLink = await screen.findByRole("link");
		expect(helpLink).toHaveTextContent("documentation page");
		expect(helpLink).toHaveAttribute("href", docsLinkUrl);
	});

	it("Clicking close button invokes `dismiss`", async (): Promise<void> => {
		const dismiss = jest.fn();
		render(<NoDevtoolsErrorBar dismiss={dismiss} retrySearch={(): void => {}} />);

		const dismissButton = await screen.findByRole("button"); // Dismiss button is first button rendered
		await userEvent.click(dismissButton);
		expect(dismiss).toHaveBeenCalled();
	});

	it("Clicking retry button invokes `retrySearch`", async (): Promise<void> => {
		const retrySearch = jest.fn();
		render(<NoDevtoolsErrorBar dismiss={(): void => {}} retrySearch={retrySearch} />);

		const retrySearchButton = await screen.findByTestId("retry-search-button");
		await userEvent.click(retrySearchButton);
		expect(retrySearch).toHaveBeenCalled();
	});
});
