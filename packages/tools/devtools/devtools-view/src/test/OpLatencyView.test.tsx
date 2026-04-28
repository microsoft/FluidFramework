/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { DevtoolsFeatures } from "@fluidframework/devtools-core/internal";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { MessageRelayContext } from "../MessageRelayContext.js";
import { OpLatencyView } from "../components/index.js";

import { assertNoAccessibilityViolations, MockMessageRelay } from "./utils/index.js";

// Note: ResizeObserver is stubbed in jest.setup.cjs (required before tests run).

const mockMessageRelayEnabled = new MockMessageRelay(() => {
	return {
		type: DevtoolsFeatures.MessageType,
		source: "OpLatencyTest",
		data: {
			features: {
				telemetry: true,
				opLatencyTelemetry: true,
			},
			devtoolsVersion: "1.0.0",
			unsampledTelemetry: true,
		},
	};
});
const mockMessageRelayDisabled = new MockMessageRelay(() => {
	return {
		type: DevtoolsFeatures.MessageType,
		source: "OpLatencyTest",
		data: {
			features: {
				telemetry: true,
				opLatencyTelemetry: true,
			},
			devtoolsVersion: "1.0.0",
			unsampledTelemetry: false,
		},
	};
});

describe("OpLatencyView component tests", () => {
	it("Renders as expected when unsampled telemetry is enabled", async (): Promise<void> => {
		render(
			<MessageRelayContext.Provider value={mockMessageRelayEnabled}>
				<OpLatencyView />
			</MessageRelayContext.Provider>,
		);

		// Check that outermost component container exists (throws if not found)
		await screen.findByTestId("test-op-latency-view");

		// Check that graph title exists as a header component
		const opLatencyHeaderElement = await screen.findByText("Op Latency");
		assert.match(opLatencyHeaderElement.tagName, /h[1-6]/i);

		// Confirm helper text header exists
		await screen.findByText("About");
	});

	it("Renders as expected when unsampled telemetry is disabled", async (): Promise<void> => {
		render(
			<MessageRelayContext.Provider value={mockMessageRelayDisabled}>
				<OpLatencyView />
			</MessageRelayContext.Provider>,
		);

		// Check that graph title exists as a header component
		await screen.findByText("Op Latency");

		// Confirm helper text header exists
		await screen.findByText(`Enable Unsampled Telemetry`);
	});
});

describe("OpLatencyView Accessibility Check", () => {
	it("OpLatencyView is accessible", async () => {
		const { container } = render(
			<MessageRelayContext.Provider value={mockMessageRelayEnabled}>
				<OpLatencyView />
			</MessageRelayContext.Provider>,
		);
		await assertNoAccessibilityViolations(container);
	});

	it("Can tab/arrow navigate through OpLatencyView with telemetry enabled", async () => {
		render(
			<MessageRelayContext.Provider value={mockMessageRelayEnabled}>
				<OpLatencyView />
			</MessageRelayContext.Provider>,
		);

		const user = userEvent.setup();

		await user.tab();
		const opsLink = screen.getByRole("link", { name: /Fluid Framework Ops Documentation/ });
		assert.strictEqual(document.activeElement, opsLink);

		await user.tab();
		const disableTelemetryButton = screen.getByText("Disable Unsampled Telemetry");
		assert.strictEqual(document.activeElement, disableTelemetryButton);
	});
	it("Can tab/arrow navigate through OpLatencyView with telemetry disabled", async () => {
		render(
			<MessageRelayContext.Provider value={mockMessageRelayDisabled}>
				<OpLatencyView />
			</MessageRelayContext.Provider>,
		);

		const user = userEvent.setup();

		await user.tab();
		const enableUnsampledTelemtryButton = await screen.findByText(
			"Enable Unsampled Telemetry",
		);
		assert.strictEqual(document.activeElement, enableUnsampledTelemtryButton);
	});
});
