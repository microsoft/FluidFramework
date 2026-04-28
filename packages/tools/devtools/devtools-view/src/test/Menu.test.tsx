/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type DevtoolsFeatureFlags,
	DevtoolsFeatures,
} from "@fluidframework/devtools-core/internal";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { type FC, useState } from "react";

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
	const MenuWrapper: FC = () => {
		const [menuSelection, setMenuSelection] = useState<MenuSelection>({
			type: "homeMenuSelection",
		});

		const mockRemoveContainer = (_containerKey: string): void => {
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
		assert.strictEqual(document.activeElement, homeHeader);

		await user.tab();
		const refreshButton = screen.getByRole("button", { name: /refresh containers list/i });
		assert.strictEqual(document.activeElement, refreshButton);

		await user.tab();
		const container1 = screen.getByRole("button", {
			name: /Container1/,
		});
		assert.strictEqual(document.activeElement, container1);

		await user.tab();
		const removeButtons = screen.getAllByRole("button", { name: /remove container/i });
		assert.strictEqual(document.activeElement, removeButtons[0]);

		await user.tab();
		const container2 = screen.getByRole("button", {
			name: /Container2/,
		});
		assert.strictEqual(document.activeElement, container2);

		await user.tab();
		assert.strictEqual(document.activeElement, removeButtons[1]);

		await user.tab();
		const events = screen.getByRole("button", { name: "Events" });
		assert.strictEqual(document.activeElement, events);

		await user.tab();
		const opLatency = screen.getByRole("button", { name: "Op Latency" });
		assert.strictEqual(document.activeElement, opLatency);

		await user.tab();
		const settings = screen.getByRole("button", { name: "Settings" });
		assert.strictEqual(document.activeElement, settings);
	});
});
