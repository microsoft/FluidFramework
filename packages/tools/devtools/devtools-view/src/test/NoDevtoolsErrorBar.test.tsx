/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { spy } from "sinon";

import { NoDevtoolsErrorBar, coreErrorMessage, docsLinkUrl } from "../components/index.js";

describe("NoDevtoolsErrorBar component tests", () => {
	it("Displays expected text and contains expected link", async (): Promise<void> => {
		render(<NoDevtoolsErrorBar dismiss={(): void => {}} retrySearch={(): void => {}} />);

		await screen.findByText(coreErrorMessage); // Will throw if exact text not found

		const helpLink = await screen.findByRole("link");
		assert.match(helpLink.textContent ?? "", /documentation page/);
		assert.equal(helpLink.getAttribute("href"), docsLinkUrl);
	});

	it("Clicking close button invokes `dismiss`", async (): Promise<void> => {
		const dismiss = spy();
		render(<NoDevtoolsErrorBar dismiss={dismiss} retrySearch={(): void => {}} />);

		const dismissButton = await screen.findByRole("button"); // Dismiss button is first button rendered
		await userEvent.click(dismissButton);
		assert.equal(dismiss.called, true);
	});

	it("Clicking retry button invokes `retrySearch`", async (): Promise<void> => {
		const retrySearch = spy();
		render(<NoDevtoolsErrorBar dismiss={(): void => {}} retrySearch={retrySearch} />);

		const retrySearchButton = await screen.findByTestId("retry-search-button");
		await userEvent.click(retrySearchButton);
		assert.equal(retrySearch.called, true);
	});
});
