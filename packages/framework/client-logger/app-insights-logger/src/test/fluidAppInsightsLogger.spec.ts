/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";

import { ApplicationInsights, type IEventTelemetry } from "@microsoft/applicationinsights-web";
import type Sinon from "sinon";
import { assert as sinonAssert, spy } from "sinon";
import {
	createLogger,
	type TelemetryFilter,
	type FluidAppInsightsLoggerConfig,
} from "../fluidAppInsightsLogger";

describe("FluidAppInsightsLogger", () => {
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

	it("send() routes telemetry events to ApplicationInsights.trackEvent", () => {
		const logger = createLogger(appInsightsClient);

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

	it("constructor() throws error when filter config with duplicate namespaces is provided", () => {
		const invalidConfig: FluidAppInsightsLoggerConfig = {
			filtering: {
				mode: "inclusive",
				filters: [
					{
						namespacePattern: "A:B:C",
					},
					{
						namespacePattern: "A:B:C",
					},
				],
			},
		};
		assert.throws(
			() => createLogger(appInsightsClient, invalidConfig),
			new Error("Cannot have duplicate namespace pattern filters"),
		);
	});

	it("constructor() throws error when filter config with namespace pattern exception that is not part of the parent pattern is provided", () => {
		const invalidConfig: FluidAppInsightsLoggerConfig = {
			filtering: {
				mode: "inclusive",
				filters: [
					{
						namespacePattern: "A:B:C",
						namespacePatternExceptions: new Set(["D:C:A"]),
					},
				],
			},
		};
		assert.throws(
			() => createLogger(appInsightsClient, invalidConfig),
			new Error(
				"Cannot have a namespace pattern exception that is not a child of the parent namespace",
			),
		);
	});

	it("constructor() throws error when multiple filters that only define categories are provided", () => {
		const invalidConfig: FluidAppInsightsLoggerConfig = {
			filtering: {
				mode: "inclusive",
				filters: [
					{
						categories: ["error"],
					},
					{
						categories: ["generic", "performance"],
					},
				],
			},
		};
		assert.throws(
			() => createLogger(appInsightsClient, invalidConfig),
			new Error("Cannot have multiple filters that only define categories"),
		);
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
		const logger = createLogger(appInsightsClient, {
			filtering: {
				mode: "exclusive",
			},
		});

		const perfCategoryEvent = {
			category: "performance",
			eventName: "perfCategoryEventName",
		};

		logger.send(perfCategoryEvent);

		// Expect all events to be sent in exclusive mode
		sinonAssert.callCount(trackEventSpy, 1);
	});

	it("inclusive filter mode sends no events when no filters are defined", () => {
		const logger = createLogger(appInsightsClient, {
			filtering: {
				mode: "inclusive",
			},
		});

		const perfCategoryEvent = {
			category: "performance",
			eventName: "perfCategoryEventName",
		};

		logger.send(perfCategoryEvent);

		// Expect no events to be sent
		sinonAssert.callCount(trackEventSpy, 0);
	});
});

describe("Telemetry Filter - Category Filtering", () => {
	let appInsightsClient: ApplicationInsights;
	let trackEventSpy: Sinon.SinonSpy;
	const configFilters: TelemetryFilter[] = [
		{
			categories: ["performance", "generic"],
		},
	];
	const exclusiveLoggerFilterConfig: FluidAppInsightsLoggerConfig = {
		filtering: {
			mode: "exclusive",
			filters: configFilters,
		},
	};
	const inclusiveLoggerFilterConfig: FluidAppInsightsLoggerConfig = {
		filtering: {
			mode: "inclusive",
			filters: configFilters,
		},
	};

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

	it("exclusive filtering mode DOES NOT SEND events that DO MATCH with atleast one category within a single filter containing multiple categories", () => {
		const logger = createLogger(appInsightsClient, {
			filtering: {
				mode: "exclusive",
				filters: [
					{
						categories: ["performance", "generic"],
					},
				],
			},
		});

		// should be excluded - matches category filter
		const event = {
			category: "performance",
			eventName: "perf:runtime:container",
		};
		// should be excluded - matches category filter
		const event2 = {
			category: "generic",
			eventName: "perf:runtime:container",
		};
		logger.send(event);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 0);
	});

	it("exclusive filter mode DOES NOT SEND events that DO MATCH with one of multiple category filters", () => {
		const logger = createLogger(appInsightsClient, exclusiveLoggerFilterConfig);
		// should be excluded - match with category in filter
		const event1 = {
			category: "performance",
			eventName: "perf:latency:ops",
		};
		// should be excluded - match with category in filter
		const event2 = {
			category: "generic",
			eventName: "perf:memory:container",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 0);
	});

	it("exclusive filter mode DOES SEND events that DO NOT MATCH with one of multiple category filters", () => {
		const logger = createLogger(appInsightsClient, exclusiveLoggerFilterConfig);
		// should be included - does not match any category filter
		const event = {
			category: "error",
			eventName: "perf:runtime:container",
		};

		logger.send(event);

		const expectedAppInsightsSentEvent: IEventTelemetry = {
			name: event.eventName,
			properties: {
				...event,
			},
		};
		sinonAssert.callCount(trackEventSpy, 1);
		for (const call of trackEventSpy.getCalls()) {
			sinonAssert.calledWithExactly(call, expectedAppInsightsSentEvent);
		}
	});

	// ------------------------------------------------------------------------------------

	it("inclusive filtering mode DOES SEND events that DO MATCH with atleast one category within a single filter containing multiple categories", () => {
		const logger = createLogger(appInsightsClient, {
			filtering: {
				mode: "inclusive",
				filters: [
					{
						categories: ["performance", "generic"],
					},
				],
			},
		});

		// should be included - matches category filter
		const event = {
			category: "performance",
			eventName: "perf:runtime:container",
		};
		// should be included - matches category filter
		const event2 = {
			category: "generic",
			eventName: "perf:runtime:container",
		};
		logger.send(event);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 2);
	});

	it("inclusive filter mode DOES SEND events that DO MATCH with one of multiple category filters", () => {
		const logger = createLogger(appInsightsClient, inclusiveLoggerFilterConfig);
		// should be included - match with category filter
		const event1 = {
			category: "performance",
			eventName: "perf:latency:ops",
		};
		// should be included - match with category filter
		const event2 = {
			category: "generic",
			eventName: "perf:memory:container",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 2);
	});

	it("inclusive filter mode DOES NOT SEND events that DO NOT MATCH with one of multiple category filters", () => {
		const logger = createLogger(appInsightsClient, inclusiveLoggerFilterConfig);
		// should be excluded - does not match any category filter
		const event = {
			category: "error",
			eventName: "perf:runtime:container",
		};

		logger.send(event);
		sinonAssert.callCount(trackEventSpy, 0);
	});
});

describe("Telemetry Filter - Namespace Filtering", () => {
	let appInsightsClient: ApplicationInsights;
	let trackEventSpy: Sinon.SinonSpy;
	const namespaceFilterPattern1 = "perf:latency";
	const namespaceFilterPattern2 = "perf:memory";
	const namespaceFilterPattern1Exception = `${namespaceFilterPattern1}:ops`;
	const namespaceFilterPattern2Exception = `${namespaceFilterPattern2}:container`;
	const configFilters: TelemetryFilter[] = [
		{
			namespacePattern: namespaceFilterPattern1,
			namespacePatternExceptions: new Set([namespaceFilterPattern1Exception]),
		},
		{
			namespacePattern: namespaceFilterPattern2,
			namespacePatternExceptions: new Set([namespaceFilterPattern2Exception]),
		},
	];
	const exclusiveLoggerFilterConfig: FluidAppInsightsLoggerConfig = {
		filtering: {
			mode: "exclusive",
			filters: configFilters,
		},
	};
	const inclusiveLoggerFilterConfig: FluidAppInsightsLoggerConfig = {
		filtering: {
			mode: "inclusive",
			filters: configFilters,
		},
	};

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

	it("exclusive filter mode DOES NOT SEND events that MATCH with one of multiple namespace filters", () => {
		const logger = createLogger(appInsightsClient, exclusiveLoggerFilterConfig);
		// should be excluded - partial match with namespace filter
		const event1 = {
			category: "performance",
			eventName: `${namespaceFilterPattern1}:signals`,
		};
		// should be excluded - partial match with second namespace filter
		const event2 = {
			category: "performance",
			eventName: `${namespaceFilterPattern2}:ops:summary`,
		};
		// should be excluded - perfect match with namespace filter
		const event3 = {
			category: "performance",
			eventName: namespaceFilterPattern1,
		};
		// should be excluded - perfect match with second namespace filter
		const event4 = {
			category: "performance",
			eventName: namespaceFilterPattern2,
		};
		logger.send(event1);
		logger.send(event2);
		logger.send(event3);
		logger.send(event4);
		sinonAssert.callCount(trackEventSpy, 0);
	});

	it("exclusive filter mode DOES SEND events that DO NOT MATCH with one of multiple namespace filters", () => {
		const logger = createLogger(appInsightsClient, exclusiveLoggerFilterConfig);
		// should be included - does not match any namespace filter
		const event = {
			category: "performance",
			eventName: "perf:runtime:container",
		};

		logger.send(event);

		const expectedAppInsightsSentEvent: IEventTelemetry = {
			name: event.eventName,
			properties: {
				...event,
			},
		};
		sinonAssert.callCount(trackEventSpy, 1);
		for (const call of trackEventSpy.getCalls()) {
			sinonAssert.calledWithExactly(call, expectedAppInsightsSentEvent);
		}
	});

	it("exclusive filter mode DOES SEND events that MATCH with one of multiple namespace filters if they also partially match with a namespace exception", () => {
		const logger = createLogger(appInsightsClient, exclusiveLoggerFilterConfig);
		// should be included - partial match with namespace filter but also partially matches namespace pattern exception
		const event1 = {
			category: "performance",
			eventName: `${namespaceFilterPattern1Exception}:roundTripTime`,
		};
		// should be included - partial match with second namespace filter but also partially matches namespace pattern exception
		const event2 = {
			category: "performance",
			eventName: `${namespaceFilterPattern2Exception}:summary`,
		};
		// should be included - partial match with namespace filter but also perfectly matches namespace pattern exception
		const event3 = {
			category: "performance",
			eventName: namespaceFilterPattern1Exception,
		};
		// should be included - partial match with second namespace filter but also perfectly matches namespace pattern exception
		const event4 = {
			category: "performance",
			eventName: namespaceFilterPattern2Exception,
		};
		logger.send(event1);
		logger.send(event2);
		logger.send(event3);
		logger.send(event4);
		sinonAssert.callCount(trackEventSpy, 4);
	});

	// ------------------------------------------------------------------------------------

	it("inclusive filter mode DOES SEND events that MATCH with one of multiple namespace filters", () => {
		const logger = createLogger(appInsightsClient, inclusiveLoggerFilterConfig);
		// should be included - partial match with namespace filter
		const event1 = {
			category: "performance",
			eventName: `${namespaceFilterPattern1}:signals`,
		};
		// should be included - partial match with second namespace filter
		const event2 = {
			category: "performance",
			eventName: `${namespaceFilterPattern2}:ops:summary`,
		};
		// should be included - perfect match with namespace filter
		const event3 = {
			category: "performance",
			eventName: namespaceFilterPattern1,
		};
		// should be included - perfect match with second namespace filter
		const event4 = {
			category: "performance",
			eventName: namespaceFilterPattern2,
		};
		logger.send(event1);
		logger.send(event2);
		logger.send(event3);
		logger.send(event4);
		sinonAssert.callCount(trackEventSpy, 4);
	});

	it("inclusive filter mode DOES NOT SEND events that DO NOT MATCH with one of multiple namespace filters", () => {
		const logger = createLogger(appInsightsClient, inclusiveLoggerFilterConfig);
		// should be excluded - does not match any namespace filter
		const event = {
			category: "performance",
			eventName: "perf:runtime:container",
		};

		logger.send(event);
		sinonAssert.callCount(trackEventSpy, 0);
	});

	it("inclusive filter mode DOES NOT SEND events that MATCH with one of multiple namespace filters if they also partially match with a namespace exception", () => {
		const logger = createLogger(appInsightsClient, inclusiveLoggerFilterConfig);
		// should be excluded - partial match with namespace filter but also partially matches namespace pattern exception
		const event1 = {
			category: "performance",
			eventName: `${namespaceFilterPattern1}:ops:roundTripTime`,
		};
		// should be excluded - partial match with second namespace filter but also partially matches namespace pattern exception
		const event2 = {
			category: "performance",
			eventName: `${namespaceFilterPattern2}:container:summary`,
		};
		// should be excluded - partial match with namespace filter but also perfectly matches namespace pattern exception
		const event3 = {
			category: "performance",
			eventName: namespaceFilterPattern1Exception,
		};
		// should be excluded - partial match with second namespace filter but also perfectly matches namespace pattern exception
		const event4 = {
			category: "performance",
			eventName: namespaceFilterPattern2Exception,
		};
		logger.send(event1);
		logger.send(event2);
		logger.send(event3);
		logger.send(event4);
		sinonAssert.callCount(trackEventSpy, 0);
	});

	it("inclusive filter mode DOES NOT SEND events that DO NOT MATCH the most specific filter despite matching more generic ones. ", () => {
		const logger = createLogger(appInsightsClient, {
			filtering: {
				mode: "inclusive",
				filters: [
					{
						namespacePattern: "A:B",
						categories: ["generic", "error"],
					},
					{
						namespacePattern: "A:B:C",
						categories: ["error"],
					},
				],
			},
		});

		// should be excluded because the event matches the "A:B" filter but the "A:B:C" filter is more specific
		// so it should be evaluated first and it only allows "errors".
		const event1 = {
			category: "generic",
			eventName: "A:B:C",
		};

		// should be included because it matches the "A:B:C" filter that should be getting applied to it
		const event2 = {
			category: "error",
			eventName: "A:B:C",
		};

		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 1);
		for (const call of trackEventSpy.getCalls()) {
			sinonAssert.calledWithExactly(call, {
				name: event2.eventName,
				properties: {
					...event2,
				},
			});
		}
	});
});

describe("Telemetry Filter - Category & Namespace Combination Filtering", () => {
	let appInsightsClient: ApplicationInsights;
	let trackEventSpy: Sinon.SinonSpy;
	const configFilters: TelemetryFilter[] = [
		{
			categories: ["performance"],
			namespacePattern: "perf:latency",
			namespacePatternExceptions: new Set(["perf:latency:ops"]),
		},
	];
	const exclusiveLoggerFilterConfig: FluidAppInsightsLoggerConfig = {
		filtering: {
			mode: "exclusive",
			filters: configFilters,
		},
	};
	const inclusiveLoggerFilterConfig: FluidAppInsightsLoggerConfig = {
		filtering: {
			mode: "inclusive",
			filters: configFilters,
		},
	};

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

	it("exclusive filter mode DOES NOT SEND events that match combination category and namespace filters unless they match a namespace exception", () => {
		const logger = createLogger(appInsightsClient, exclusiveLoggerFilterConfig);

		// should be included - does not match any filter
		const event1 = {
			category: "error",
			eventName: "perf:runtime:container",
		};

		// should be included - only partial matches namespace filter but not category
		const event2 = {
			category: "error",
			eventName: "perf:latency:ops:delta",
		};

		// should be included - partial namespace match and category match but also matches exception.
		const event3 = {
			category: "performance",
			eventName: "perf:latency:ops:delta",
		};

		// should be excluded - perfect namespace and category match.
		const event4 = {
			category: "performance",
			eventName: "perf:latency",
		};

		// should be excluded - partial namespace match and category match.
		const event5 = {
			category: "performance",
			eventName: "perf:latency:container:syncTime",
		};

		logger.send(event1);
		logger.send(event2);
		logger.send(event3);
		logger.send(event4);
		logger.send(event5);

		const actualSentEvent1 = trackEventSpy.getCalls().filter((call) =>
			call.calledWithExactly({
				name: event1.eventName,
				properties: {
					...event1,
				},
			}),
		);
		const actualSentEvent2 = trackEventSpy.getCalls().filter((call) =>
			call.calledWithExactly({
				name: event2.eventName,
				properties: {
					...event2,
				},
			}),
		);
		const actualSentEvent3 = trackEventSpy.getCalls().filter((call) =>
			call.calledWithExactly({
				name: event3.eventName,
				properties: {
					...event3,
				},
			}),
		);

		sinonAssert.callCount(trackEventSpy, 3);
		assert.strictEqual(actualSentEvent1.length, 1);
		assert.strictEqual(actualSentEvent2.length, 1);
		assert.strictEqual(actualSentEvent3.length, 1);
	});

	it("inclusive filter mode DOES SEND events that match combination category and namespace filters unless they match a namespace exception", () => {
		const logger = createLogger(appInsightsClient, inclusiveLoggerFilterConfig);

		// should be excluded - does not match any filter
		const event1 = {
			category: "error",
			eventName: "perf:runtime:container",
		};

		// should be excluded - only partial matches namespace filter but not category
		const event2 = {
			category: "error",
			eventName: "perf:latency:ops:delta",
		};

		// should be excluded - partial namespace match and category match but also matches exception.
		const event3 = {
			category: "performance",
			eventName: "perf:latency:ops:delta",
		};

		// should be included - perfect namespace and category match.
		const event4 = {
			category: "performance",
			eventName: "perf:latency",
		};

		// should be included - partial namespace match and category match.
		const event5 = {
			category: "performance",
			eventName: "perf:latency:container:syncTime",
		};

		logger.send(event1);
		logger.send(event2);
		logger.send(event3);
		logger.send(event4);
		logger.send(event5);

		const actualSentEvent4 = trackEventSpy.getCalls().filter((call) =>
			call.calledWithExactly({
				name: event4.eventName,
				properties: {
					...event4,
				},
			}),
		);
		const actualSentEvent5 = trackEventSpy.getCalls().filter((call) =>
			call.calledWithExactly({
				name: event4.eventName,
				properties: {
					...event4,
				},
			}),
		);

		sinonAssert.callCount(trackEventSpy, 2);
		assert.strictEqual(actualSentEvent4.length, 1);
		assert.strictEqual(actualSentEvent5.length, 1);
	});
});
