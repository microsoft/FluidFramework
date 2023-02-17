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
			try {
				mockLogger.assertMatchAny([]);
				assert.fail("Did not throw as expected");
			} catch (err: any) {
				assert.strictEqual(err?.message, "Must specify at least 1 event");
			}
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
	});

	describe("assertMatch", () => {
		let mockLogger: MockLogger;
		beforeEach(() => {
			mockLogger = new MockLogger();
		});

		it("throws if passed an empty events list", () => {
			try {
				mockLogger.assertMatchAny([]);
				assert.fail("Did not throw as expected");
			} catch (err: any) {
				assert.strictEqual(err?.message, "Must specify at least 1 event");
			}
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
			try {
				mockLogger.assertMatch([{ eventName: "B", a: 2 }], "my error message");
				assert.fail("Did not throw as expected");
			} catch (err: any) {
				assert.strictEqual(
					err?.message,
					`my error message
expected:
[{"eventName":"B","a":2}]

actual:
[{"category":"generic","eventName":"A","a":1}]`,
				);
			}
		});
	});

	describe("assertMatchAny", () => {
		let mockLogger: MockLogger;
		beforeEach(() => {
			mockLogger = new MockLogger();
		});

		it("throws if passed an empty events list", () => {
			try {
				mockLogger.assertMatchAny([]);
				assert.fail("Did not throw as expected");
			} catch (err: any) {
				assert.strictEqual(err?.message, "Must specify at least 1 event");
			}
		});

		it("doesn't throw when all expected events are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });
			mockLogger.assertMatchAny([
				{ eventName: "A", a: 1 },
				{ eventName: "B", a: 2 },
			]);
			// Doesn't throw
		});

		it("doesn't throw if only one of the expected events is found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.assertMatchAny([
				{ eventName: "A", a: 1 },
				{ eventName: "B", a: 2 },
			]);
			// Doesn't throw
		});

		it("throws when expected event is not found", () => {
			try {
				mockLogger.assertMatchAny([{ eventName: "A", a: 1 }], "my error message");
				assert.fail("Did not throw as expected");
			} catch (err: any) {
				assert.strictEqual(
					err?.message,
					`my error message
expected:
[{"eventName":"A","a":1}]

actual:
[]`,
				);
			}
		});
	});

	describe("assertMatchNone", () => {
		let mockLogger: MockLogger;
		beforeEach(() => {
			mockLogger = new MockLogger();
		});

		it("throws if passed an empty events list", () => {
			try {
				mockLogger.assertMatchNone([]);
				assert.fail("Did not throw as expected");
			} catch (err: any) {
				assert.strictEqual(err?.message, "Must specify at least 1 event");
			}
		});

		it("doesn't throw when no expected events are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });
			mockLogger.assertMatchNone([{ eventName: "C", a: 3 }]);
			// Doesn't throw
		});

		it("throws if one of the expected events is found", () => {
			// Doesn't throw
		});

		it("throws if one of the expected events is found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			try {
				mockLogger.assertMatchNone(
					[
						{ eventName: "A", a: 1 },
						{ eventName: "B", a: 2 },
					],
					"my error message",
				);
				assert.fail("Did not throw as expected");
			} catch (err: any) {
				assert.strictEqual(
					err?.message,
					`my error message
disallowed events:
[{"eventName":"A","a":1},{"eventName":"B","a":2}]

actual:
[{"category":"generic","eventName":"A","a":1}]`,
				);
			}
		});
	});

	describe("assertMatchStrict", () => {
		let mockLogger: MockLogger;
		beforeEach(() => {
			mockLogger = new MockLogger();
		});

		it("throws if passed an empty events list", () => {
			try {
				mockLogger.assertMatchStrict([]);
				assert.fail("Did not throw as expected");
			} catch (err: any) {
				assert.strictEqual(err?.message, "Must specify at least 1 event");
			}
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

		it("throws if not all the expected events are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			try {
				mockLogger.assertMatchStrict(
					[
						{ eventName: "A", a: 1 },
						{ eventName: "B", a: 2 },
					],
					"my error message",
				);
				assert.fail("Did not throw as expected");
			} catch (err: any) {
				assert.strictEqual(
					err?.message,
					`my error message
expected:
[{"eventName":"A","a":1},{"eventName":"B","a":2}]

actual:
[{"category":"generic","eventName":"A","a":1}]`,
				);
			}
		});

		it("throws if events other than the expected ones are found", () => {
			mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
			mockLogger.sendTelemetryEvent({ eventName: "B", a: 2 });
			mockLogger.sendTelemetryEvent({ eventName: "C", a: 3 });
			try {
				mockLogger.assertMatchStrict(
					[
						{ eventName: "A", a: 1 },
						{ eventName: "B", a: 2 },
					],
					"my error message",
				);
				assert.fail("Did not throw as expected");
			} catch (err: any) {
				assert.strictEqual(
					err?.message,
					`my error message
expected:
[{"eventName":"A","a":1},{"eventName":"B","a":2}]

actual:
[{"category":"generic","eventName":"A","a":1},{"category":"generic","eventName":"B","a":2},{"category":"generic","eventName":"C","a":3}]`,
				);
			}
		});
	});
});
