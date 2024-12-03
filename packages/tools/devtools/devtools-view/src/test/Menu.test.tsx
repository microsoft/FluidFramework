/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type DevtoolsFeatureFlags,
	DevtoolsFeatures,
} from "@fluidframework/devtools-core/internal";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import React from "react";

import { MessageRelayContext } from "../MessageRelayContext.js";
import { Menu, type MenuSelection } from "../components/index.js";

import { assertNoAccessibilityViolations, MockMessageRelay } from "./utils/index.js";

describe("Menu Accessibility Check", () => {
	const supportedFeatures: DevtoolsFeatureFlags = {
		telemetry: true,
		opLatencyTelemetry: true,
	};
	const containers = ["Container1", "Container2"];
	const mockMessageRelay = new MockMessageRelay(() => {
		return {
			type: DevtoolsFeatures.MessageType,
			source: "MenuAccessibilityTest",
			data: {
				features: supportedFeatures,
				devtoolsVersion: "1.0.0",
				unsampledTelemetry: true,
			},
		};
	});
	const MenuWrapper: React.FC = () => {
		const [menuSelection, setMenuSelection] = React.useState<MenuSelection>({
			type: "homeMenuSelection",
		});

		return (
			<MessageRelayContext.Provider value={mockMessageRelay}>
				<Menu
					currentSelection={menuSelection}
					setSelection={setMenuSelection}
					containers={containers}
					supportedFeatures={supportedFeatures}
				/>
			</MessageRelayContext.Provider>
		);
	};

	it("Menu is accessible", async () => {
		const { container } = render(<MenuWrapper />);
		await assertNoAccessibilityViolations(container);
	});

	it("Can tab/arrow navigate through the Menu", async () => {
		render(<MenuWrapper />);

		const user = userEvent.setup();

		await user.tab();
		const homeHeader = screen.getByText("Home");
		expect(homeHeader).toHaveFocus();

		await user.tab();
		const refreshButton = screen.getByRole("button", { name: /refresh containers list/i });
		expect(refreshButton).toHaveFocus();

		await user.tab();
		const container1 = screen.getByText("Container1");
		expect(container1).toHaveFocus();

		await user.tab();
		const container2 = screen.getByText("Container2");
		expect(container2).toHaveFocus();

		await user.tab();
		const events = screen.getByText("Events");
		expect(events).toHaveFocus();

		await user.tab();
		const opLatency = screen.getByText("Op Latency");
		expect(opLatency).toHaveFocus();

		await user.tab();
		const settings = screen.getByText("Settings");
		expect(settings).toHaveFocus();
	});
});
