/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type DevtoolsFeatureFlags,
	DevtoolsFeatures,
} from "@fluidframework/devtools-core/internal";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { type FC, useState } from "react";
import { useFakeTimers } from "sinon";

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

	for (const activation of ["click", "Enter", "Space"] as const) {
		it(`Announces selections with ${activation} without moving focus`, () => {
			const clock = useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			try {
				render(<MenuWrapper />);
				const navigation = screen.getByRole("navigation", { name: "Developer tools" });
				const [status] = within(navigation).getAllByRole("status");

				if (activation === "click") {
					assert.equal(status.textContent, "");
					assert.equal(status.getAttribute("aria-live"), "polite");
					assert.equal(status.getAttribute("aria-atomic"), "true");
					assert.equal(
						screen.getByRole("button", { name: "Home" }).getAttribute("aria-current"),
						"page",
					);
				}

				const selections = [
					["Container1", "Container Container1 selected."],
					["Container2", "Container Container2 selected."],
					["Events", "Events selected."],
					["Op Latency", "Op Latency selected."],
					["Settings", "Settings selected."],
					["Home", "Home selected."],
				];
				// Events and Home use separate keyboard handlers.
				const selectionsToTest =
					activation === "click"
						? selections
						: selections.filter(([name]) => name === "Events" || name === "Home");
				for (const [name, message] of selectionsToTest) {
					const item = within(navigation).getByRole("button", { name: new RegExp(name) });
					item.focus();
					if (activation === "click") {
						fireEvent.click(item);
					} else {
						fireEvent.keyDown(item, { key: activation === "Enter" ? "Enter" : " " });
					}

					act(() => {
						clock.tick(100);
					});
					assert.equal(status.textContent, message);
					assert.deepEqual(within(navigation).getAllByRole("button", { current: "page" }), [
						item,
					]);
					assert.equal(document.activeElement, item);
				}
			} finally {
				clock.restore();
			}
		});
	}

	it("Announces repeated activation of the current item", () => {
		const clock = useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			render(<MenuWrapper />);
			const home = screen.getByRole("button", { name: "Home" });
			const [status] = screen.getAllByRole("status");
			home.focus();

			fireEvent.click(home);
			act(() => {
				clock.tick(100);
			});
			assert.equal(status.textContent, "Home selected.");

			fireEvent.click(home);
			assert.equal(status.textContent, "");
			act(() => {
				clock.tick(100);
			});
			assert.equal(status.textContent, "Home selected.");
			assert.equal(document.activeElement, home);
		} finally {
			clock.restore();
		}
	});

	it("Keeps the status region unchanged when the menu rerenders without navigation", () => {
		const clock = useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const { rerender } = render(<MenuWrapper />);
			const [status] = screen.getAllByRole("status");

			fireEvent.click(screen.getByRole("button", { name: "Events" }));
			act(() => {
				clock.tick(100);
			});
			assert.equal(status.textContent, "Events selected.");

			rerender(<MenuWrapper />);
			assert.equal(screen.getAllByRole("status")[0], status);
			assert.equal(status.textContent, "Events selected.");
		} finally {
			clock.restore();
		}
	});

	it("Cancels an outdated announcement after a rapid selection change", () => {
		const clock = useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			render(<MenuWrapper />);
			const [status] = screen.getAllByRole("status");

			fireEvent.click(screen.getByRole("button", { name: /Container1/ }));
			act(() => {
				clock.tick(50);
			});
			fireEvent.click(screen.getByRole("button", { name: "Events" }));
			act(() => {
				clock.tick(50);
			});
			assert.equal(status.textContent, "");

			act(() => {
				clock.tick(50);
			});
			assert.equal(status.textContent, "Events selected.");
		} finally {
			clock.restore();
		}
	});

	it("Cancels a pending announcement when the menu unmounts", () => {
		const clock = useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const { unmount } = render(<MenuWrapper />);
			fireEvent.click(screen.getByRole("button", { name: "Home" }));
			assert.equal(clock.countTimers(), 1);

			unmount();
			assert.equal(clock.countTimers(), 0);
		} finally {
			clock.restore();
		}
	});

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
