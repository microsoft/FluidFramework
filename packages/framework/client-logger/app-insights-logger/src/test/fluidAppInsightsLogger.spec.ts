/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { assert, spy } from "sinon";
import { FluidAppInsightsLogger } from "../fluidAppInsightsLogger";

describe("FluidAppInsightsLogger", () => {
	it("send() routes telemetry events to ApplicationInsights.trackEvent", () => {
		const appInsightsClient = new ApplicationInsights({
			config: {
				connectionString:
					// (this is an example string)
					"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
			},
		});
		const trackEventSpy = spy(appInsightsClient, "trackEvent");

		const logger = new FluidAppInsightsLogger(appInsightsClient);

		const mockTelemetryEvent = {
			category: "mockEvent",
			eventName: "mockEventName",
		};
		logger.send(mockTelemetryEvent);
		assert.calledOnce(trackEventSpy);

		const expectedAppInsightsEvent = {
			name: mockTelemetryEvent.eventName,
			properties: mockTelemetryEvent,
		};

		assert.calledWith(trackEventSpy, expectedAppInsightsEvent);
	});
});
