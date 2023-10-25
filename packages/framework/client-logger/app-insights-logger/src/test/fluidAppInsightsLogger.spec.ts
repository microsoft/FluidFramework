/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";

import { ApplicationInsights, type IEventTelemetry } from "@microsoft/applicationinsights-web";
import type Sinon from "sinon";
import { assert as sinonAssert, spy } from "sinon";
import {
	FluidAppInsightsLogger,
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
		const logger = new FluidAppInsightsLogger(appInsightsClient, {
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
			categories: ["performance"],
		},
		{
			categories: ["generic"],
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

	it("exclusive filtering mode DOES SEND events that DO MATCH with atleast one category within a single filter containing multiple categories", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, {
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
		const logger = new FluidAppInsightsLogger(appInsightsClient, exclusiveLoggerFilterConfig);
		// should be excluded - match with category filter
		const event1 = {
			category: "performance",
			eventName: "perf:latency:ops",
		};
		// should be excluded - match with second category filter
		const event2 = {
			category: "generic",
			eventName: "perf:memory:container",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 0);
	});

	it("exclusive filter mode DOES SEND events that DO NOT MATCH with one of multiple category filters", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, exclusiveLoggerFilterConfig);
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
		const logger = new FluidAppInsightsLogger(appInsightsClient, {
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
		const logger = new FluidAppInsightsLogger(appInsightsClient, inclusiveLoggerFilterConfig);
		// should be included - match with category filter
		const event1 = {
			category: "performance",
			eventName: "perf:latency:ops",
		};
		// should be included - match with second category filter
		const event2 = {
			category: "generic",
			eventName: "perf:memory:container",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 2);
	});

	it("inclusive filter mode DOES NOT SEND events that DO NOT MATCH with one of multiple category filters", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, inclusiveLoggerFilterConfig);
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
	const configFilters: TelemetryFilter[] = [
		{
			namespacePattern: "perf:latency",
			namespacePatternExceptions: ["perf:latency:ops"],
		},
		{
			namespacePattern: "perf:memory",
			namespacePatternExceptions: ["perf:memory:container"],
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

	it("exclusive filter mode DOES NOT SEND events that PARITALLY MATCH with one of multiple namespace filters", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, exclusiveLoggerFilterConfig);
		// should be excluded - partial match with namespace filter
		const event1 = {
			category: "performance",
			eventName: "perf:latency:signals",
		};
		// should be excluded - partial match with second namespace filter
		const event2 = {
			category: "performance",
			eventName: "perf:memory:ops:summary",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 0);
	});

	it("exclusive filter mode DOES NOT SEND events that PERFECTLY MATCH with one of multiple namespace filters", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, exclusiveLoggerFilterConfig);
		// should be excluded - perfect match with namespace filter
		const event1 = {
			category: "performance",
			eventName: "perf:latency",
		};
		// should be excluded - perfect match with second namespace filter
		const event2 = {
			category: "performance",
			eventName: "perf:memory",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 0);
	});

	it("exclusive filter mode DOES SEND events that DO NOT MATCH with one of multiple namespace filters", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, exclusiveLoggerFilterConfig);
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

	it("exclusive filter mode DOES SEND events that PARITALLY MATCH with one of multiple namespace filters if they also partially match with a namespace exception", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, exclusiveLoggerFilterConfig);
		// should be included - partial match with namespace filter but also partially matches namespace pattern exception
		const event1 = {
			category: "performance",
			eventName: "perf:latency:ops:roundTripTime",
		};
		// should be included - partial match with second namespace filter but also partially matches namespace pattern exception
		const event2 = {
			category: "performance",
			eventName: "perf:memory:container:summary",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 2);
	});

	it("exclusive filter mode DOES SEND events that PERFECTLY MATCH with one of multiple namespace filters if they also perfectly match with a namespace exception", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, exclusiveLoggerFilterConfig);
		// should be included - partial match with namespace filter but also perfectly matches namespace pattern exception
		const event1 = {
			category: "performance",
			eventName: "perf:latency:ops",
		};
		// should be included - partial match with second namespace filter but also perfectly matches namespace pattern exception
		const event2 = {
			category: "performance",
			eventName: "perf:memory:container",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 2);
	});

	// ------------------------------------------------------------------------------------

	it("inclusive filter mode DOES SEND events that PARITALLY MATCH with one of multiple namespace filters", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, inclusiveLoggerFilterConfig);
		// should be included - partial match with namespace filter
		const event1 = {
			category: "performance",
			eventName: "perf:latency:signals",
		};
		// should be included - partial match with second namespace filter
		const event2 = {
			category: "performance",
			eventName: "perf:memory:ops:summary",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 2);
	});

	it("inclusive filter mode DOES SEND events that PERFECTLY MATCH with one of multiple namespace filters", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, inclusiveLoggerFilterConfig);
		// should be included - perfect match with namespace filter
		const event1 = {
			category: "performance",
			eventName: "perf:latency",
		};
		// should be included - perfect match with second namespace filter
		const event2 = {
			category: "performance",
			eventName: "perf:memory",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 2);
	});

	it("inclusive filter mode DOES NOT SEND events that DO NOT MATCH with one of multiple namespace filters", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, inclusiveLoggerFilterConfig);
		// should be excluded - does not match any namespace filter
		const event = {
			category: "performance",
			eventName: "perf:runtime:container",
		};

		logger.send(event);
		sinonAssert.callCount(trackEventSpy, 0);
	});

	it("inclusive filter mode DOES NOT SEND events that PARITALLY MATCH with one of multiple namespace filters if they also partially match with a namespace exception", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, inclusiveLoggerFilterConfig);
		// should be excluded - partial match with namespace filter but also partially matches namespace pattern exception
		const event1 = {
			category: "performance",
			eventName: "perf:latency:ops:roundTripTime",
		};
		// should be excluded - partial match with second namespace filter but also partially matches namespace pattern exception
		const event2 = {
			category: "performance",
			eventName: "perf:memory:container:summary",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 0);
	});

	it("inclusive filter mode DOES NOT SEND events that PERFECTLY MATCH with one of multiple namespace filters if they also perfectly match with a namespace exception", () => {
		const logger = new FluidAppInsightsLogger(appInsightsClient, inclusiveLoggerFilterConfig);
		// should be excluded - partial match with namespace filter but also perfectly matches namespace pattern exception
		const event1 = {
			category: "performance",
			eventName: "perf:latency:ops",
		};
		// should be excluded - partial match with second namespace filter but also perfectly matches namespace pattern exception
		const event2 = {
			category: "performance",
			eventName: "perf:memory:container",
		};
		logger.send(event1);
		logger.send(event2);
		sinonAssert.callCount(trackEventSpy, 0);
	});
});

describe("Telemetry Filter - Category & Namespace Combination Filtering", () => {
	let appInsightsClient: ApplicationInsights;
	let trackEventSpy: Sinon.SinonSpy;
	const configFilters: TelemetryFilter[] = [
		{
			categories: ["performance"],
			namespacePattern: "perf:latency",
			namespacePatternExceptions: ["perf:latency:ops"],
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
		const logger = new FluidAppInsightsLogger(appInsightsClient, exclusiveLoggerFilterConfig);

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
		const logger = new FluidAppInsightsLogger(appInsightsClient, inclusiveLoggerFilterConfig);

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
