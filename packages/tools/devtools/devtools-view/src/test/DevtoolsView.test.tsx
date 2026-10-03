/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { render, screen } from "@testing-library/react";

import { View } from "../DevtoolsView.js";

describe("DevtoolsView navigation accessibility", () => {
	it("Moves focus to the page heading only when the selected view changes", () => {
		const { rerender } = render(<View menuSelection={{ type: "homeMenuSelection" }} />);

		const homeHeading = screen.getByRole("heading", { level: 1, name: "Home" });
		assert.notEqual(document.activeElement, homeHeading);

		rerender(
			<View
				menuSelection={{
					type: "containerMenuSelection",
					containerKey: "Test Container",
				}}
				containers={[]}
			/>,
		);

		const containerHeading = screen.getByRole("heading", {
			level: 1,
			name: "Container: Test Container",
		});
		assert.equal(document.activeElement, containerHeading);

		const retainedFocusTarget = document.createElement("button");
		document.body.append(retainedFocusTarget);
		retainedFocusTarget.focus();

		rerender(
			<View
				menuSelection={{
					type: "containerMenuSelection",
					containerKey: "Test Container",
				}}
				containers={[]}
			/>,
		);

		assert.equal(document.activeElement, retainedFocusTarget);
		retainedFocusTarget.remove();
	});
});
