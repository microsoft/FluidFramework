/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { unreachableCase } from "@fluidframework/core-utils";
import { ParallelRequests } from "../parallelRequests.js";

enum HowMany {
	Exact,
	Partial,
	TooMany,
}

describe("Parallel Requests", () => {
	async function test(
		concurrency: number,
		payloadSize: number,
		from: number,
		to: number,
		expectedRequests: number,
		knownTo: boolean,
		howMany: HowMany = HowMany.Exact,
	) {
		let nextElement = from;
		let requests = 0;
		let dispatches = 0;

		const logger = new MockLogger();

		const manager = new ParallelRequests<number>(
			from,
			knownTo ? to : undefined,
			payloadSize,
			logger.toTelemetryLogger(),
			async (request: number, _from: number, _to: number) => {
				let length = _to - _from;
				requests++;

				assert(_from >= from);
				assert(length <= payloadSize);
				assert(requests <= request);
				assert(!knownTo || _to <= to);

				switch (howMany) {
					case HowMany.Partial:
						length = Math.min(length, payloadSize / 2 + 1);
						break;
					case HowMany.TooMany:
						length = 2 * length + 2;
						break;
					case HowMany.Exact:
						break;
					default:
						unreachableCase(howMany);
				}
				// covering knownTo === false case
				const actualTo = Math.min(_from + length, to);

				const payload: number[] = [];
				for (let i = _from; i < actualTo; i++) {
					payload.push(i);
				}

				return {
					partial: _from !== to && howMany === HowMany.Partial,
					cancel: false,
					payload,
				};
			},
			(deltas: number[]) => {
				dispatches++;
				// Big chunks are broken into smaller ones
				assert(dispatches <= requests || howMany === HowMany.TooMany);
				for (const el of deltas) {
					assert(el === nextElement);
					nextElement++;
				}
			},
		);

		await manager.run(concurrency);

		assert(nextElement === to);
		assert(!knownTo || dispatches === requests);
		assert.equal(requests, expectedRequests, "expected requests");
		logger.assertMatchNone([{ category: "error" }]);
	}

	async function testCancel(
		from: number,
		to: number | undefined,
		cancelAt: number,
		payloadSize,
		expectedRequests: number,
	) {
		let nextElement = from;
		let requests = 0;
		let dispatches = 0;
		const logger = new MockLogger();

		const manager = new ParallelRequests<number>(
			from,
			to,
			payloadSize,
			logger.toTelemetryLogger(),
			async (request: number, _from: number, _to: number) => {
				const length = _to - _from;
				requests++;

				assert(_from >= from);
				assert(length <= payloadSize);
				assert(requests <= request);
				assert(to === undefined || _to <= to);

				if (_to > cancelAt) {
					return { partial: false, cancel: true, payload: [] };
				}

				const payload: number[] = [];
				for (let i = _from; i < _to; i++) {
					payload.push(i);
				}

				return { partial: false, cancel: false, payload };
			},
			(deltas: number[]) => {
				dispatches++;
				assert(dispatches <= requests);
				for (const el of deltas) {
					assert(el === nextElement);
					nextElement++;
				}
			},
		);

		await manager.run(10);

		assert(dispatches <= requests);
		assert(requests === expectedRequests);
		logger.assertMatchNone([{ category: "error" }]);
	}

	it("no concurrency, single request, over", async () => {
		await test(1, 100, 123, 156, 1, true);
		await test(1, 100, 123, 156, 1, false);
		await test(1, 100, 123, 156, 1, true, HowMany.TooMany);
		await test(1, 100, 123, 156, 1, true, HowMany.Partial);
	});

	it("no concurrency, single request, exact", async () => {
		await test(1, 156 - 123, 123, 156, 1, true);
		await test(1, 156 - 123, 123, 156, 2, false);
		await test(1, 156 - 123, 123, 156, 1, true, HowMany.TooMany);
		await test(1, 156 - 123, 123, 156, 2, true, HowMany.Partial);
		await test(1, 156 - 123, 123, 156, 2, false, HowMany.TooMany);
		await test(1, 156 - 123, 123, 156, 3, false, HowMany.Partial);
	});

	it("concurrency, single request, exact", async () => {
		await test(2, 156 - 123, 123, 156, 1, true);
		await test(2, 156 - 123, 123, 156, 1, true, HowMany.TooMany);
		await test(2, 156 - 123, 123, 156, 2, true, HowMany.Partial);
		// here, the number of actual requests is Ok to be 2..3
		await test(2, 156 - 123, 123, 156, 3, false);
		await test(2, 156 - 123, 123, 156, 3, false, HowMany.TooMany);
		await test(2, 156 - 123, 123, 156, 3, false, HowMany.Partial);
	});

	it("no concurrency, multiple requests", async () => {
		await test(1, 10, 123, 156, 4, true);
		await test(1, 10, 123, 156, 4, false);
		await test(1, 10, 123, 156, 3, false, HowMany.TooMany);
	});

	it("two concurrent requests exact", async () => {
		await test(2, 10, 123, 153, 3, true);
		await test(2, 10, 123, 153, 3, true, HowMany.TooMany);
		await test(2, 10, 123, 153, 6, true, HowMany.Partial);
		await test(2, 10, 123, 153, 5, false);
		await test(2, 10, 123, 153, 5, false, HowMany.TooMany);
		await test(2, 10, 123, 153, 8, false, HowMany.Partial);
	});

	it("two concurrent requests one over", async () => {
		await test(2, 10, 123, 154, 4, true);
		// here, the number of actual requests is Ok to be 4..5
		await test(2, 10, 123, 154, 5, false);
	});

	it("four concurrent requests", async () => {
		await test(4, 10, 123, 156, 4, true);
		// here, the number of actual requests is Ok to be 4..7
		await test(4, 10, 123, 156, 7, false);
	});

	it("cancellation", async () => {
		await testCancel(1, 1000, 502, 10, 60);
		await testCancel(1, undefined, 502, 10, 60);
	});

	it("exception in request", async () => {
		const logger = new MockLogger();

		const manager = new ParallelRequests<number>(
			1,
			100,
			10,
			logger.toTelemetryLogger(),
			async (request: number, _from: number, _to: number) => {
				throw new Error("request");
			},
			(deltas: number[]) => {
				throw new Error("response");
			},
		);

		let success = true;
		try {
			await manager.run(10);
		} catch (error: any) {
			success = false;
			assert(error.message === "request");
		}
		assert(!success);
		logger.assertMatchNone([{ category: "error" }]);
	});

	it("exception in response", async () => {
		const logger = new MockLogger();

		const manager = new ParallelRequests<number>(
			1,
			100,
			10,
			logger.toTelemetryLogger(),
			async (request: number, _from: number, _to: number) => {
				return { cancel: false, partial: false, payload: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
			},
			(deltas: number[]) => {
				throw new Error("response");
			},
		);

		let success = true;
		try {
			await manager.run(10);
		} catch (error: any) {
			success = false;
			assert(error.message === "response");
		}
		assert(!success);
		logger.assertMatchNone([{ category: "error" }]);
	});
});
