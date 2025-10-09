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

		const mockRemoveContainer = (containerKey: string): void => {
			// Mock remove function for testing
		};

		return (
			<MessageRelayContext.Provider value={mockMessageRelay}>
				<Menu
					currentSelection={menuSelection}
					setSelection={setMenuSelection}
					containers={containers}
					supportedFeatures={supportedFeatures}
					onRemoveContainer={mockRemoveContainer}
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
		const homeHeader = screen.getByRole("button", { name: "Home" });
		expect(homeHeader).toHaveFocus();

		await user.tab();
		const refreshButton = screen.getByRole("button", { name: /refresh containers list/i });
		expect(refreshButton).toHaveFocus();

		await user.tab();
		const container1 = screen.getByRole("button", {
			name: /Container1/,
		});
		expect(container1).toHaveFocus();

		await user.tab();
		const removeButtons = screen.getAllByRole("button", { name: /remove container/i });
		expect(removeButtons[0]).toHaveFocus();

		await user.tab();
		const container2 = screen.getByRole("button", {
			name: /Container2/,
		});
		expect(container2).toHaveFocus();

		await user.tab();
		expect(removeButtons[1]).toHaveFocus();

		await user.tab();
		const events = screen.getByRole("button", { name: "Events" });
		expect(events).toHaveFocus();

		await user.tab();
		const opLatency = screen.getByRole("button", { name: "Op Latency" });
		expect(opLatency).toHaveFocus();

		await user.tab();
		const settings = screen.getByRole("button", { name: "Settings" });
		expect(settings).toHaveFocus();
	});
});
