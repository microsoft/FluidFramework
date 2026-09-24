/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ContainerStateChange,
	type DevtoolsFeatureFlags,
	DevtoolsFeatures,
	GetContainerState,
} from "@fluidframework/devtools-core/internal";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { render, screen } from "@testing-library/react";
import { strict as assert } from "node:assert";

import { ContainerFeatureFlagContext } from "../ContainerFeatureFlagHelper.js";
import { MessageRelayContext } from "../MessageRelayContext.js";
import { ContainerSummaryView } from "../components/index.js";
import { statusInfoTooltipPositioning } from "../components/TooltipPositioning.js";

import { assertNoAccessibilityViolations, MockMessageRelay } from "./utils/index.js";

describe("ContainerSummaryView Accessibility Check", () => {
	const supportedFeatures: DevtoolsFeatureFlags = {
		telemetry: true,
		opLatencyTelemetry: true,
	};

	// Mock feature flag to test that the ContainerSummaryView is accessible when the container state modification is supported
	const mockFeatureFlags = {
		containerFeatureFlags: {
			containerDataVisualization: true,
			canModifyContainerState: true,
		},
	};

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

	const containerStateMessageRelay = new MockMessageRelay((message) => {
		if (message.type !== GetContainerState.MessageType) {
			return undefined;
		}

		return {
			...ContainerStateChange.createMessage({
				containerKey: "Container1",
				containerState: {
					containerKey: "Container1",
					closed: false,
					attachState: AttachState.Attached,
					connectionState: ConnectionState.Connected,
				},
			}),
			source: "ContainerSummaryViewTest",
		};
	});

	it("ContainerSummaryView is accessible", async () => {
		const { container } = render(
			<MessageRelayContext.Provider value={mockMessageRelay}>
				<ContainerFeatureFlagContext.Provider value={mockFeatureFlags}>
					<ContainerSummaryView containerKey="Container1" />
				</ContainerFeatureFlagContext.Provider>
			</MessageRelayContext.Provider>,
		);
		await assertNoAccessibilityViolations(container);
	});

	it("positions the Status information popover away from the page heading", async () => {
		assert.deepEqual(statusInfoTooltipPositioning, {
			position: "below",
			align: "start",
			fallbackPositions: ["after-top", "before-top"],
		});

		render(
			<MessageRelayContext.Provider value={containerStateMessageRelay}>
				<ContainerFeatureFlagContext.Provider value={mockFeatureFlags}>
					<ContainerSummaryView containerKey="Container1" />
				</ContainerFeatureFlagContext.Provider>
			</MessageRelayContext.Provider>,
		);

		const statusInformationButton = await screen.findByRole("button", {
			name: "Status information",
		});
		assert.equal(statusInformationButton.getAttribute("type"), "button");
		assert.equal(
			statusInformationButton.getAttribute("aria-labelledby")?.split(" ").length,
			2,
		);
	});
});
