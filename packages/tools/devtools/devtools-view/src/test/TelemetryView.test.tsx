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

import { MessageRelayContext } from "../MessageRelayContext.js";
import { TelemetryView } from "../components/index.js";

import { assertNoAccessibilityViolations, MockMessageRelay } from "./utils/index.js";

describe("TelemetryView Accessibility Check", () => {
	const supportedFeatures: DevtoolsFeatureFlags = {
		telemetry: true,
		opLatencyTelemetry: true,
	};
	const mockMessageRelay = new MockMessageRelay(() => {
		return {
			type: DevtoolsFeatures.MessageType,
			source: "TelemetryViewAccessibilityTest",
			data: {
				features: supportedFeatures,
				devtoolsVersion: "1.0.0",
				unsampledTelemetry: true,
			},
		};
	});
	it("TelemetryView is accessible", async () => {
		const { container } = render(
			<MessageRelayContext.Provider value={mockMessageRelay}>
				<TelemetryView />
			</MessageRelayContext.Provider>,
		);
		await assertNoAccessibilityViolations(container);
	});

	it("Can tab/arrow navigate through the TelemetryView", async () => {
		// Send a mock message so a telemetry event is received and the table is populated
		mockMessageRelay.emit("message", {
			type: "TELEMETRY_EVENT",
			source: "TelemetryViewAccessibilityTest",
			data: {
				event: {
					category: "performance",
					logContent: {
						eventName: "fluid:telemetry:TestEvent",
					},
				},
			},
		});

		render(
			<MessageRelayContext.Provider value={mockMessageRelay}>
				<TelemetryView />
			</MessageRelayContext.Provider>,
		);

		const user = userEvent.setup();
		await user.tab();
		const maxEventsDropdown = screen.getByRole("combobox", {
			name: /Max Events to Display/,
		});
		assert.strictEqual(document.activeElement, maxEventsDropdown);
		await user.tab();
		const refreshButton = screen.getByRole("button", { name: /Refresh Telemetry/ });
		assert.strictEqual(document.activeElement, refreshButton);

		await user.click(refreshButton);
		const filterCategory = screen.getByRole("combobox", {
			name: /Category Filter/,
		});
		await user.tab();
		assert.strictEqual(document.activeElement, filterCategory);
		await user.tab();
		const eventNameFilter = screen.getByRole("combobox", { name: /Event Name Filter/ });
		assert.strictEqual(document.activeElement, eventNameFilter);
	});
});
