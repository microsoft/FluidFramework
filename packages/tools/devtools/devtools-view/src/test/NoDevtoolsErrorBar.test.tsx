/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import sinon from "sinon";

import { NoDevtoolsErrorBar, coreErrorMessage, docsLinkUrl } from "../components/index.js";

describe("NoDevtoolsErrorBar component tests", () => {
	it("Displays expected text and contains expected link", async (): Promise<void> => {
		render(<NoDevtoolsErrorBar dismiss={(): void => {}} retrySearch={(): void => {}} />);

		await screen.findByText(coreErrorMessage); // Will throw if exact text not found

		const helpLink = await screen.findByRole("link");
		assert.strictEqual(helpLink.textContent?.includes("documentation page"), true);
		assert.strictEqual(helpLink.getAttribute("href"), docsLinkUrl);
	});

	it("Clicking close button invokes `dismiss`", async (): Promise<void> => {
		const dismiss = sinon.stub();
		render(<NoDevtoolsErrorBar dismiss={dismiss} retrySearch={(): void => {}} />);

		const dismissButton = await screen.findByRole("button"); // Dismiss button is first button rendered
		await userEvent.click(dismissButton);
		assert.ok(dismiss.called);
	});

	it("Clicking retry button invokes `retrySearch`", async (): Promise<void> => {
		const retrySearch = sinon.stub();
		render(<NoDevtoolsErrorBar dismiss={(): void => {}} retrySearch={retrySearch} />);

		const retrySearchButton = await screen.findByTestId("retry-search-button");
		await userEvent.click(retrySearchButton);
		assert.ok(retrySearch.called);
	});
});
