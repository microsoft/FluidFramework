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
	const MenuWrapper: FC<{ telemetry?: boolean }> = ({ telemetry = true }) => {
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
					supportedFeatures={{ ...supportedFeatures, telemetry }}
					onRemoveContainer={mockRemoveContainer}
				/>
			</MessageRelayContext.Provider>
		);
	};

	it("Menu is accessible", async () => {
		const { container } = render(<MenuWrapper />);
		await assertNoAccessibilityViolations(container);
	});

	it("Associates the 'Events' button with its 'Telemetry' section heading", () => {
		const { rerender } = render(<MenuWrapper />);

		const telemetryHeading = screen.getByText("Telemetry");
		const headingId = telemetryHeading.id;
		const eventsButton = screen.getByRole("button", { name: "Events" });
		const group = eventsButton.closest("[role='group']");

		assert.ok(group);
		assert.equal(group.getAttribute("aria-labelledby"), telemetryHeading.id);
		assert.notEqual(telemetryHeading.id, "");
		assert.equal(group, screen.getByRole("group", { name: "Telemetry" }));
		assert.deepEqual(screen.getAllByRole("group"), [group]);

		rerender(<MenuWrapper />);
		const rerenderedGroup = screen.getByRole("group", { name: "Telemetry" });
		assert.equal(screen.getByText("Telemetry").id, headingId);
		assert.equal(rerenderedGroup.getAttribute("aria-labelledby"), headingId);
		assert.equal(
			screen.getByRole("button", { name: "Events" }).closest("[role='group']"),
			rerenderedGroup,
		);
	});

	it("Uses a distinct Telemetry heading ID for each menu", () => {
		const firstMenu = render(<MenuWrapper />);
		const secondMenu = render(<MenuWrapper />);

		for (const menu of [firstMenu, secondMenu]) {
			const menuQueries = within(menu.container);
			const heading = menuQueries.getByText("Telemetry");
			const group = menuQueries.getByRole("group", { name: "Telemetry" });
			const eventsButton = within(group).getByRole("button", { name: "Events" });

			assert.notEqual(heading.id, "");
			assert.equal(group.getAttribute("aria-labelledby"), heading.id);
			assert.equal(document.querySelector(`[id="${heading.id}"]`), heading);
			assert.equal(eventsButton.closest("[role='group']"), group);
		}
	});

	it("Exposes the Telemetry group only when telemetry is supported", () => {
		const { rerender } = render(<MenuWrapper telemetry={false} />);
		assert.equal(screen.queryByText("Telemetry"), null);
		assert.equal(screen.queryByRole("button", { name: "Events" }), null);
		assert.deepEqual(screen.queryAllByRole("group"), []);

		rerender(<MenuWrapper telemetry={true} />);
		const group = screen.getByRole("group", { name: "Telemetry" });
		assert.equal(
			screen.getByRole("button", { name: "Events" }).closest("[role='group']"),
			group,
		);

		rerender(<MenuWrapper telemetry={false} />);
		assert.equal(screen.queryByText("Telemetry"), null);
		assert.equal(screen.queryByRole("button", { name: "Events" }), null);
		assert.deepEqual(screen.queryAllByRole("group"), []);
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

		await user.tab({ shift: true });
		assert.equal(document.activeElement, events);

		await user.tab();
		assert.equal(document.activeElement, opLatency);

		await user.tab();
		const settings = screen.getByRole("button", { name: "Settings" });
		assert.equal(document.activeElement, settings);
	});
});
