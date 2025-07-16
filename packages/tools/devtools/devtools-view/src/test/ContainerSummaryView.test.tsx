/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type DevtoolsFeatureFlags,
	DevtoolsFeatures,
} from "@fluidframework/devtools-core/internal";
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import React from "react";

import { ContainerFeatureFlagContext } from "../ContainerFeatureFlagHelper.js";
import { MessageRelayContext } from "../MessageRelayContext.js";
import { ContainerSummaryView } from "../components/index.js";

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
});
