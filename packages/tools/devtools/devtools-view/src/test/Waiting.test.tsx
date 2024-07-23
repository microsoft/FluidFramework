/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { render, screen } from "@testing-library/react";
import React from "react";

import { Waiting, defaultWaitingLabel } from "../components/index.js";

describe("Waiting component tests", () => {
	it("Displays default label when a label is not specified", async (): Promise<void> => {
		render(<Waiting />);

		await screen.findByText(defaultWaitingLabel); // Will throw if exact text not found
	});

	it("Displays the provided label", async (): Promise<void> => {
		const label = "Hello world!";
		render(<Waiting label={label} />);

		await screen.findByText(label); // Will throw if exact text not found
	});
});
