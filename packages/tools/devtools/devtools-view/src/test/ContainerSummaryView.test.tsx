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

import { MessageRelayContext } from "../MessageRelayContext.js";
import { ContainerSummaryView } from "../components/index.js";

import { assertNoAccessibilityViolations, MockMessageRelay } from "./utils/index.js";

describe("ContainerSummaryView Accessibility Check", () => {
	const supportedFeatures: DevtoolsFeatureFlags = {
		telemetry: true,
		opLatencyTelemetry: true,
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
				<ContainerSummaryView containerKey="Container1" />
			</MessageRelayContext.Provider>,
		);
		await assertNoAccessibilityViolations(container);
	});
});
