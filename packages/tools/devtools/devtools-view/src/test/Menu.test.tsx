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

	for (const name of ["Home", ...containers, "Events", "Op Latency", "Settings"]) {
		it(`Keeps ${name} selected after keyboard focus moves away`, async () => {
			render(<MenuWrapper />);
			const user = userEvent.setup();
			const item = screen.getByRole("button", { name: new RegExp(`^${name}(?:$| )`) });

			await user.click(item);
			await user.tab();

			assert.notEqual(document.activeElement, item);
			assert.deepEqual(screen.getAllByRole("button", { current: "page" }), [item]);

			const nextItem = screen.getByRole("button", {
				name: name === "Home" ? "Events" : "Home",
			});
			nextItem.focus();
			await user.keyboard("{Enter}");

			assert.equal(item.hasAttribute("aria-current"), false);
			assert.deepEqual(screen.getAllByRole("button", { current: "page" }), [nextItem]);
		});
	}

	it("Can tab/arrow navigate through the Menu", async () => {
		render(<MenuWrapper />);

		const user = userEvent.setup();

		await user.tab();
		const homeHeader = screen.getByRole("button", { name: "Home" });
		assert.equal(document.activeElement, homeHeader);

		await user.tab();
		const refreshButton = screen.getByRole("button", { name: /refresh containers list/i });
		assert.equal(document.activeElement, refreshButton);

		await user.tab();
		const container1 = screen.getByRole("button", {
			name: /Container1/,
		});
		assert.equal(document.activeElement, container1);

		await user.tab();
		const removeButtons = screen.getAllByRole("button", { name: /remove container/i });
		assert.equal(document.activeElement, removeButtons[0]);

		await user.tab();
		const container2 = screen.getByRole("button", {
			name: /Container2/,
		});
		assert.equal(document.activeElement, container2);

		await user.tab();
		assert.equal(document.activeElement, removeButtons[1]);

		await user.tab();
		const events = screen.getByRole("button", { name: "Events" });
		assert.equal(document.activeElement, events);

		await user.tab();
		const opLatency = screen.getByRole("button", { name: "Op Latency" });
		assert.equal(document.activeElement, opLatency);

		await user.tab();
		const settings = screen.getByRole("button", { name: "Settings" });
		assert.equal(document.activeElement, settings);
	});
});
