/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockLogger } from "../mockLogger.js";

describe("MockLogger", () => {
	describe("matchEvents", () => {
		let mockLogger: MockLogger;
		beforeEach(() => {
			mockLogger = new MockLogger();
		});

		function assertCleared(): void {
			assert.equal(
				mockLogger.events.length,
				0,
				"Events should have been cleared post match check.",
			);
		}

		it("empty log, none expected", () => {
			assert(mockLogger.matchEvents([]));
		});

		it("empty log, one expected", () => {
			assert(!mockLogger.matchEvents([{ eventName: "A", a: 1 }]));
		});

		it("One logged, none expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(mockLogger.matchEvents([]));
		});

		it("One logged, exact match expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(mockLogger.matchEvents([{ eventName: "A", a: 1 }]));
		});

		it("One logged, partial match expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(mockLogger.matchEvents([{ eventName: "A" }]));
		});

		it("One logged, superset expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(!mockLogger.matchEvents([{ eventName: "A", a: 1, x: 0 }]));
		});

		it("One logged, unmatching expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(!mockLogger.matchEvents([{ eventName: "A", a: 999 }]));
		});

		it("One logged, reordered exact match expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(mockLogger.matchEvents([{ a: 1, eventName: "A" }]));
		});

		it("One logged, two expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(
				!mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 2 },
				]),
			);
		});

		it("Two logged, two matching expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(
				mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 2 },
				]),
			);
		});

		it("Two logged, some unmatching expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(
				!mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 999 },
				]),
			);
		});

		it("Two logged, one matching expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(mockLogger.matchEvents([{ eventName: "B", b: 2 }]));
		});

		it("Two logged, two matching out of order expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(
				!mockLogger.matchEvents([
					{ eventName: "B", b: 2 },
					{ eventName: "A", a: 1 },
				]),
			);
		});

		it("Two logged, none expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(mockLogger.matchEvents([]));
		});

		it("Two sequences, matching expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(
				mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 2 },
				]),
			);
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "C", c: 3 });
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "D", d: 4 });
			assert(
				mockLogger.matchEvents([
					{ eventName: "C", c: 3 },
					{ eventName: "D", d: 4 },
				]),
			);
		});

		it("Two sequences, redundant match expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(
				mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 2 },
				]),
			);
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "C", c: 3 });
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "D", d: 4 });
			assert(
				!mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 2 },
					{ eventName: "C", c: 3 },
					{ eventName: "D", d: 4 },
				]),
			);
		});

		it("One sequence, redundant match expected", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(
				mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 2 },
				]),
			);
			assert(
				!mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 2 },
				]),
			);
		});

		it("Details in props are inlined or not as per inlineDetailsProp", () => {
			const details = {
				id: 1,
				type: "test",
			};

			mockLogger.toTelemetryLogger().sendTelemetryEvent({
				eventName: "A",
				details: JSON.stringify(details),
			});
			// When inlineDetailsProp is true, the properties in details should be inlined.
			assert(
				mockLogger.matchEvents(
					[{ eventName: "A", id: 1, type: "test" }],
					true /* inlineDetailsProp */,
				),
			);

			// When inlineDetailsProp is not true, the properties in details should not be inlined.
			mockLogger.toTelemetryLogger().sendTelemetryEvent({
				eventName: "A",
				details: JSON.stringify(details),
			});
			assert(!mockLogger.matchEvents([{ eventName: "A", id: 1, type: "test" }]));

			// When inlineDetailsProp is not true, the properties in details should not be inlined.
			mockLogger.toTelemetryLogger().sendTelemetryEvent({
				eventName: "A",
				details: JSON.stringify(details),
			});
			assert(mockLogger.matchEvents([{ eventName: "A", details: JSON.stringify(details) }]));
		});

		it("Details in props must be a JSON stringified string when inlineDetailsProp is true", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({
				eventName: "A",
				details: 10,
			});
			assert.throws(() =>
				mockLogger.matchEvents(
					[{ eventName: "A", id: 1, type: "test" }],
					true /* inlineDetailsProp */,
				),
			);

			mockLogger.toTelemetryLogger().sendTelemetryEvent({
				eventName: "A",
				details: "details",
			});
			assert.throws(() =>
				mockLogger.matchEvents(
					[{ eventName: "A", id: 1, type: "test" }],
					true /* inlineDetailsProp */,
				),
			);
		});

		it("Assertion exceptions", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });

			try {
				mockLogger.assertMatchStrict([{ eventName: "B", b: 2 }]);
			} catch (error: unknown) {
				assert.equal(
					(error as Error).message,
					'Logs don\'t match\nexpected:\n[{"eventName":"B","b":2}]\n\nactual:\n[{"category":"generic","eventName":"A","a":1}]',
				);
				return;
			}
			assert.fail("Expected an exception to be thrown.");
		});

		it("Events are cleared after match check", () => {
			// Whether or not the match check succeeds should not affect the clearing of events.
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.matchEvents([]);
			assertCleared();

			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "B", b: 2 });
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "C", c: 3 });
			mockLogger.matchAnyEvent([{ eventName: "B", b: 2 }]);
			assertCleared();
		});

		it("Events aren't cleared when clearAfterMatchCheck is not set", () => {
			mockLogger.toTelemetryLogger().sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.matchAnyEvent(
				[{ eventName: "B", b: 2 }],
				/* inlineDetailsProp: */ false,
				/* clearEventsAfterCheck: */ false,
			);
			assert(mockLogger.events.length > 0, "Events should not have been cleared.");
		});
	});
});
