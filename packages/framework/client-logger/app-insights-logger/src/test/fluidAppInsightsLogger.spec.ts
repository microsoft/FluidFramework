/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";

import { ApplicationInsights, type IEventTelemetry } from "@microsoft/applicationinsights-web";
import type Sinon from "sinon";
import { assert as sinonAssert, spy } from "sinon";
import { FluidAppInsightsLogger, TelemetryEventCategory } from "../fluidAppInsightsLogger";

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
		sinonAssert.calledOnce(trackEventSpy);

		const expectedAppInsightsEvent = {
			name: mockTelemetryEvent.eventName,
			properties: mockTelemetryEvent,
		};

		sinonAssert.calledWith(trackEventSpy, expectedAppInsightsEvent);
	});
});

describe("Telemetry Filter - filter mode", () => {
	let appInsightsClient: ApplicationInsights;
	let trackEventSpy: Sinon.SinonSpy;

	beforeEach(() => {
		appInsightsClient = new ApplicationInsights({
			config: {
				connectionString:
					// (this is an example string)
					"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
			},
		});
		trackEventSpy = spy(appInsightsClient, "trackEvent");
	});

	it("exclusive filter mode sends all events when no filters are defined", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, {
			filterConfig: {
				mode: "exclusive",
			},
		});

		const perfCategoryEvent = {
			category: TelemetryEventCategory.Performance,
			eventName: "perfCategoryEventName",
		};

		const eventCount = 10;
		for (let i = 0; i < eventCount; i++) {
			logger.send(perfCategoryEvent);
		}
		// Expect all events to be sent in exclusive mode
		sinonAssert.callCount(trackEventSpy, eventCount);
	});

	it("inclusive filter mode sends no events when no filters are defined", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, {
			filterConfig: {
				mode: "inclusive",
			},
		});

		const perfCategoryEvent = {
			category: TelemetryEventCategory.Performance,
			eventName: "perfCategoryEventName",
		};
		for (let i = 0; i < 10; i++) {
			logger.send(perfCategoryEvent);
		}

		// Expect no events to be sent
		sinonAssert.callCount(trackEventSpy, 0);
	});
});

describe("Telemetry Filter - Category filtering", () => {
	let appInsightsClient: ApplicationInsights;
	let trackEventSpy: Sinon.SinonSpy;

	beforeEach(() => {
		appInsightsClient = new ApplicationInsights({
			config: {
				connectionString:
					// (this is an example string)
					"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
			},
		});
		trackEventSpy = spy(appInsightsClient, "trackEvent");
	});

	it("exclusive filter mode sends ALL events except those that match category filters", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, {
			filterConfig: {
				mode: "exclusive",
				filters: [
					{
						category: TelemetryEventCategory.Performance,
					},
					{
						category: TelemetryEventCategory.Generic,
					},
				],
			},
		});

		const errorCategoryEvent = {
			category: TelemetryEventCategory.Error,
			eventName: "errorCategoryEventName",
		};
		const perfCategoryEvent = {
			category: TelemetryEventCategory.Performance,
			eventName: "perfCategoryEventName",
		};
		const genericCategoryEvent = {
			category: TelemetryEventCategory.Generic,
			eventName: "genericCategoryEventName",
		};

		for (let i = 0; i < 10; i++) {
			logger.send(perfCategoryEvent);
			logger.send(errorCategoryEvent);
			logger.send(genericCategoryEvent);
		}

		const expectedSentEventCount = 10;
		const expectedAppInsightsSentEvent: IEventTelemetry = {
			name: errorCategoryEvent.eventName,
			properties: {
				...errorCategoryEvent,
			},
		};
		sinonAssert.callCount(trackEventSpy, expectedSentEventCount);
		for (const call of trackEventSpy.getCalls()) {
			sinonAssert.calledWithExactly(call, expectedAppInsightsSentEvent);
		}
	});

	it("inclusive filter mode sends NO events except those that match category filters", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, {
			filterConfig: {
				mode: "inclusive",
				filters: [
					{
						category: TelemetryEventCategory.Performance,
					},
					{
						category: TelemetryEventCategory.Generic,
					},
				],
			},
		});

		const errorCategoryEvent = {
			category: TelemetryEventCategory.Error,
			eventName: "errorCategoryEventName",
		};
		const perfCategoryEvent = {
			category: TelemetryEventCategory.Performance,
			eventName: "perfCategoryEventName",
		};
		const genericCategoryEvent = {
			category: TelemetryEventCategory.Generic,
			eventName: "genericCategoryEventName",
		};

		for (let i = 0; i < 10; i++) {
			logger.send(perfCategoryEvent);
			logger.send(errorCategoryEvent);
			logger.send(genericCategoryEvent);
		}

		const expectedSentEventCount = 20;
		sinonAssert.callCount(trackEventSpy, expectedSentEventCount);

		const actualSentPerfEvents = trackEventSpy.getCalls().filter((call) =>
			call.calledWithExactly({
				name: perfCategoryEvent.eventName,
				properties: {
					...perfCategoryEvent,
				},
			}),
		);
		const actualSentGenericEvents = trackEventSpy.getCalls().filter((call) =>
			call.calledWithExactly({
				name: genericCategoryEvent.eventName,
				properties: {
					...genericCategoryEvent,
				},
			}),
		);

		assert.strictEqual(actualSentPerfEvents.length, 10);
		assert.strictEqual(actualSentGenericEvents.length, 10);
	});
});
