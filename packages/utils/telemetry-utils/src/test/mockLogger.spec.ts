/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "../mockLogger";

describe("MockLogger", () => {
	describe("matchEvents", () => {
		let mockLogger: MockLogger;
		beforeEach(() => {
			mockLogger = new MockLogger();
		});

		it("throws if passed an empty events list", () => {
			assert.throws(
				() => mockLogger.matchEvents([]),
				(e) => e?.message === "Must specify at least 1 event",
			);
		});

		it("empty log, one expected", () => {
			assert(!mockLogger.matchEvents([{ eventName: "A", a: 1 }]));
		});

		it("One logged, exact match expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(mockLogger.matchEvents([{ eventName: "A", a: 1 }]));
		});

		it("One logged, partial match expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(mockLogger.matchEvents([{ eventName: "A" }]));
		});

		it("One logged, superset expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(!mockLogger.matchEvents([{ eventName: "A", a: 1, x: 0 }]));
		});

		it("One logged, unmatching expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(!mockLogger.matchEvents([{ eventName: "A", a: 999 }]));
		});

		it("One logged, reordered exact match expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(mockLogger.matchEvents([{ a: 1, eventName: "A" }]));
		});

		it("One logged, two expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			assert(
				!mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 2 },
				]),
			);
		});

		it("Two logged, two matching expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(
				mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 2 },
				]),
			);
		});

		it("Two logged, some unmatching expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(
				!mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 999 },
				]),
			);
		});

		it("Two logged, one matching expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(mockLogger.matchEvents([{ eventName: "B", b: 2 }]));
		});

		it("Two logged, two matching out of order expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(
				!mockLogger.matchEvents([
					{ eventName: "B", b: 2 },
					{ eventName: "A", a: 1 },
				]),
			);
		});

		it("Two sequences, matching expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(
				mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 2 },
				]),
			);
			mockLogger.sendTelemetryEvent({ eventName: "C", c: 3 });
			mockLogger.sendTelemetryEvent({ eventName: "D", d: 4 });
			assert(
				mockLogger.matchEvents([
					{ eventName: "C", c: 3 },
					{ eventName: "D", d: 4 },
				]),
			);
		});

		it("Two sequences, redundant match expected", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
			assert(
				mockLogger.matchEvents([
					{ eventName: "A", a: 1 },
					{ eventName: "B", b: 2 },
				]),
			);
			mockLogger.sendTelemetryEvent({ eventName: "C", c: 3 });
			mockLogger.sendTelemetryEvent({ eventName: "D", d: 4 });
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
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
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

			mockLogger.sendTelemetryEvent({ eventName: "A", details: JSON.stringify(details) });
			// When inlineDetailsProp is true, the properties in details should be inlined.
			assert(
				mockLogger.matchEvents(
					[{ eventName: "A", id: 1, type: "test" }],
					true /* inlineDetailsProp */,
				),
			);

			// When inlineDetailsProp is not true, the properties in details should not be inlined.
			mockLogger.sendTelemetryEvent({ eventName: "A", details: JSON.stringify(details) });
			assert(!mockLogger.matchEvents([{ eventName: "A", id: 1, type: "test" }]));

			// When inlineDetailsProp is not true, the properties in details should not be inlined.
			mockLogger.sendTelemetryEvent({ eventName: "A", details: JSON.stringify(details) });
			assert(mockLogger.matchEvents([{ eventName: "A", details: JSON.stringify(details) }]));
		});

		it("Details in props must be a JSON stringified string when inlineDetailsProp is true", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", details: 10 });
			assert.throws(() =>
				mockLogger.matchEvents(
					[{ eventName: "A", id: 1, type: "test" }],
					true /* inlineDetailsProp */,
				),
			);

			mockLogger.sendTelemetryEvent({ eventName: "A", details: "details" });
			assert.throws(() =>
				mockLogger.matchEvents(
					[{ eventName: "A", id: 1, type: "test" }],
					true /* inlineDetailsProp */,
				),
			);
		});

		it("clears internal events buffer", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.matchEvents([{ eventName: "A", a: 1 }]);
			assert.strictEqual(mockLogger.events.length, 0);
		});
	});

	describe("assertMatch", () => {
		let mockLogger: MockLogger;
		beforeEach(() => {
			mockLogger = new MockLogger();
		});

		it("throws if passed an empty events list", () => {
			assert.throws(
				() => mockLogger.assertMatch([]),
				(e) => e?.message === "Must specify at least 1 event",
			);
		});

		it("doesn't throw when all expected events are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });
			mockLogger.assertMatch([
				{ eventName: "A", a: 1 },
				{ eventName: "B", a: 2 },
			]);
			// Doesn't throw
		});

		it("throws when expected event is not found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			assert.throws(
				() => mockLogger.assertMatch([{ eventName: "B", a: 2 }], "my error message"),
				(err) =>
					err.message ===
					`my error message
expected:
[{"eventName":"B","a":2}]

actual:
[{"category":"generic","eventName":"A","a":1}]`,
			);
		});

		it("clears internal events buffer", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.assertMatch([{ eventName: "A", a: 1 }]);
			assert.strictEqual(mockLogger.events.length, 0);
		});
	});

	describe("assertMatchStrict", () => {
		let mockLogger: MockLogger;
		beforeEach(() => {
			mockLogger = new MockLogger();
		});

		it("doesn't throw when expecting no events and none are found", () => {
			mockLogger.assertMatchStrict([]);
			// Doesn't throw
		});

		it("doesn't throw when exactly the expected events are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });
			mockLogger.assertMatchStrict([
				{ eventName: "A", a: 1 },
				{ eventName: "B", a: 2 },
			]);
			// Doesn't throw
		});

		it("throws if expected events are not in order", () => {
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			assert.throws(
				() =>
					mockLogger.assertMatchStrict(
						[
							{ eventName: "A", a: 1 },
							{ eventName: "B", a: 2 },
						],
						"my error message",
					),
				(err) =>
					err.message ===
					`my error message
expected:
[{"eventName":"A","a":1},{"eventName":"B","a":2}]

actual:
[{"category":"generic","eventName":"B","a":2},{"category":"generic","eventName":"A","a":1}]`,
			);
		});

		it("throws if no events are expected but some are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			assert.throws(
				() => mockLogger.assertMatchStrict([], "my error message"),
				(err) =>
					err.message ===
					`my error message
expected:
[]

actual:
[{"category":"generic","eventName":"A","a":1}]`,
			);
		});

		it("throws if not all the expected events are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			assert.throws(
				() =>
					mockLogger.assertMatchStrict(
						[
							{ eventName: "A", a: 1 },
							{ eventName: "B", a: 2 },
						],
						"my error message",
					),
				(err) =>
					err.message ===
					`my error message
expected:
[{"eventName":"A","a":1},{"eventName":"B","a":2}]

actual:
[{"category":"generic","eventName":"A","a":1}]`,
			);
		});

		it("throws if events other than the expected ones are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });
			mockLogger.sendTelemetryEvent({ eventName: "C", a: 3 });
			assert.throws(
				() =>
					mockLogger.assertMatchStrict(
						[
							{ eventName: "A", a: 1 },
							{ eventName: "B", a: 2 },
						],
						"my error message",
					),
				(err) =>
					err.message ===
					`my error message
expected:
[{"eventName":"A","a":1},{"eventName":"B","a":2}]

actual:
[{"category":"generic","eventName":"A","a":1},{"category":"generic","eventName":"B","a":2},{"category":"generic","eventName":"C","a":3}]`,
			);
		});

		it("clears internal events buffer", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.assertMatchStrict([{ eventName: "A", a: 1 }]);
			assert.strictEqual(mockLogger.events.length, 0);
		});
	});

	describe("matchAnyEvent", () => {
		let mockLogger: MockLogger;
		beforeEach(() => {
			mockLogger = new MockLogger();
		});

		it("throws if passed an empty events list", () => {
			assert.throws(
				() => mockLogger.matchAnyEvent([]),
				(e) => e?.message === "Must specify at least 1 event",
			);
		});

		it("returns true when one expected event is found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });
			const result = mockLogger.matchAnyEvent([
				{ eventName: "A", a: 1 },
				{ eventName: "C", c: 1 },
			]);
			assert.strictEqual(result, true);
		});

		it("returns false if none of the expected events are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });
			const result = mockLogger.matchAnyEvent([
				{ eventName: "C", c: 1 },
				{ eventName: "D", d: 1 },
			]);
			assert.strictEqual(result, false);
		});

		it("clears internal events buffer", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.matchAnyEvent([{ eventName: "A", a: 1 }]);
			assert.strictEqual(mockLogger.events.length, 0);
		});
	});

	describe("assertMatchAny", () => {
		let mockLogger: MockLogger;
		beforeEach(() => {
			mockLogger = new MockLogger();
		});

		it("throws if passed an empty events list", () => {
			assert.throws(
				() => mockLogger.assertMatchAny([]),
				(e) => e?.message === "Must specify at least 1 event",
			);
		});

		it("throws if none of the expected events are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });
			assert.throws(
				() =>
					mockLogger.assertMatchAny(
						[
							{ eventName: "C", c: 1 },
							{ eventName: "D", d: 1 },
						],
						"my error message",
					),
				(e) =>
					e?.message ===
					`my error message
expected:
[{"eventName":"C","c":1},{"eventName":"D","d":1}]

actual:
[{"category":"generic","eventName":"A","a":1},{"category":"generic","eventName":"B","a":2}]`,
			);
		});

		it("doesn't throw when one expected event is found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });

			// Doesn't throw when matching the first existing event
			mockLogger.assertMatchAny([
				{ eventName: "A", a: 1 },
				{ eventName: "C", c: 1 },
			]);

			// Log messages again since previous call cleared them
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });

			// Doesn't throw when matching the second existing event
			mockLogger.assertMatchAny([
				{ eventName: "B", a: 2 },
				{ eventName: "C", c: 1 },
			]);
		});

		it("doesn't throw when all expected events are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });

			mockLogger.assertMatchAny([
				{ eventName: "A", a: 1 },
				{ eventName: "B", b: 2 },
			]);
			// Doesn't throw
		});

		it("clears internal events buffer", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.assertMatchAny([{ eventName: "A", a: 1 }]);
			assert.strictEqual(mockLogger.events.length, 0);
		});
	});

	describe("assertMatchNone", () => {
		let mockLogger: MockLogger;
		beforeEach(() => {
			mockLogger = new MockLogger();
		});

		it("throws if passed an empty events list", () => {
			assert.throws(
				() => mockLogger.assertMatchNone([]),
				(e) => e?.message === "Must specify at least 1 event",
			);
		});

		it("throws if disallowed event found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			assert.throws(
				() => mockLogger.assertMatchNone([{ eventName: "A", a: 1 }], "my error message"),
				(e) =>
					e?.message ===
					`my error message
disallowed events:
[{"eventName":"A","a":1}]

actual:
[{"category":"generic","eventName":"A","a":1}]`,
			);
		});

		it("doesn't throw if disallowed event is not found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.assertMatchNone([{ eventName: "B", b: 1 }]);
			// Doesn't throw
		});

		it("clears internal events buffer", () => {
			mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
			mockLogger.assertMatchNone([{ eventName: "A", a: 1 }]);
			assert.strictEqual(mockLogger.events.length, 0);
		});
	});
});
