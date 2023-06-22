/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

// // eslint-disable-next-line import/no-unassigned-import
// import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import { Waiting, defaultWaitingLabel } from "../components";

describe("Waiting component tests", () => {
	// eslint-disable-next-line jest/expect-expect
	it("Displays default label when a label is not specified", async (): Promise<void> => {
		render(<Waiting />);

		await screen.findByText(defaultWaitingLabel); // Will throw if exact text not found
	});

	// eslint-disable-next-line jest/expect-expect
	it("Displays the provided label", async (): Promise<void> => {
		const label = "Hello world!";
		render(<Waiting label={label} />);

		await screen.findByText(label); // Will throw if exact text not found
	});
});
