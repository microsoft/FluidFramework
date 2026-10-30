/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { Deferred, PromiseCache } from "@fluidframework/core-utils/internal";
import type { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";
import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils/internal";
import {
	createChildMonitoringContext,
	MockLogger,
} from "@fluidframework/telemetry-utils/internal";
import { restore, stub, useFakeTimers, type SinonFakeTimers, type SinonStub } from "sinon";

import { createOdspUrl } from "../createOdspUrl.js";
import { createOdspCacheAndTracker } from "../epochTracker.js";
import {
	type INonPersistentCache,
	LocalPersistentCache,
	NonPersistentCache,
} from "../odspCache.js";
import { OdspDelayLoadedDeltaStream } from "../odspDelayLoadedDeltaStream.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import { getJoinSessionCacheKey } from "../odspUtils.js";

describe("join-session throttle coordination", () => {
	let clock: SinonFakeTimers;
	let fetchStub: SinonStub<Parameters<typeof fetch>, ReturnType<typeof fetch>>;
	let cache: NonPersistentCache;
	let resolvedUrl: IOdspResolvedUrl;
	const streams: OdspDelayLoadedDeltaStream[] = [];
	const response = {
		deltaStorageUrl: "https://example.invalid/deltas",
		deltaStreamSocketUrl: "https://example.invalid/socket",
		id: "session",
		tenantId: "tenant",
		snapshotStorageUrl: "https://example.invalid/snapshot",
		refreshSessionDurationSeconds: 3600,
	};

	function createStream(
		url = resolvedUrl,
		sharedCache: INonPersistentCache = cache,
		logger = new MockLogger(),
	): OdspDelayLoadedDeltaStream {
		const mc = createChildMonitoringContext({ logger: logger.toTelemetryLogger() });
		const { cache: odspCache, epochTracker } = createOdspCacheAndTracker(
			new LocalPersistentCache(),
			sharedCache,
			{ docId: url.hashedDocumentId, resolvedUrl: url },
			mc.logger,
		);
		const stream = new OdspDelayLoadedDeltaStream(
			url,
			{},
			async () => "Bearer test",
			undefined,
			mc,
			odspCache,
			{},
			epochTracker,
			() => {},
			() => {},
		);
		streams.push(stream);
		return stream;
	}

	async function join(
		stream: OdspDelayLoadedDeltaStream,
		refresh = false,
		socketToken = false,
		periodicRefresh = false,
	): Promise<unknown> {
		// eslint-disable-next-line @typescript-eslint/dot-notation
		return stream["joinSessionCore"](socketToken, { refresh }, periodicRefresh, undefined);
	}

	function throttle(seconds: number): Response {
		return new Response("{}", {
			status: 429,
			headers: { "retry-after": `${seconds}` },
		});
	}

	function success(): Response {
		return new Response(JSON.stringify(response), {
			headers: { "content-type": "application/json", "x-fluid-epoch": "epoch" },
		});
	}

	beforeEach(async () => {
		resolvedUrl = await new OdspDriverUrlResolver().resolve({
			url: createOdspUrl({
				siteUrl: "https://example.invalid",
				driveId: "drive",
				itemId: "item",
				dataStorePath: "/",
			}),
		});
		cache = new NonPersistentCache();
		clock = useFakeTimers();
		fetchStub = stub(globalThis, "fetch");
		fetchStub.onFirstCall().resolves(throttle(120));
		fetchStub.callsFake(async () => success());
	});

	afterEach(() => {
		for (const stream of streams.splice(0)) {
			stream.dispose();
		}
		restore();
		clock.restore();
	});

	for (const [caller, refresh, socketToken, periodicRefresh, freshStream] of [
		["initialConnect", false, false, false, true],
		["reconnect", false, false, false, false],
		["periodicRefresh", false, false, true, false],
		["socketTokenRefresh", true, true, false, false],
		["storageTokenRefresh", true, false, false, false],
	] as const) {
		it(`retains Retry-After after rejection for ${caller}`, async () => {
			const logger = new MockLogger();
			const stream = createStream(resolvedUrl, cache, logger);
			await assert.rejects(join(stream), { errorType: "throttlingError" });
			assert.equal(clock.countTimers(), 0, "the failed join does not schedule a retry");
			const next = join(
				freshStream ? createStream(resolvedUrl, cache, logger) : stream,
				refresh,
				socketToken,
				periodicRefresh,
			);
			await clock.tickAsync(119999);
			assert.equal(fetchStub.callCount, 1, "no request before the server deadline");
			await clock.tickAsync(1);
			await next;
			assert.equal(fetchStub.callCount, 2, "the delay must not be applied twice");
			assert.ok(
				logger.events.some(
					(event) =>
						event.eventName.endsWith("JoinSessionThrottleWait") &&
						event.joinSessionCaller === caller,
				),
			);
		});
	}

	it("coalesces callers while waiting for a deadline and while the request is in flight", async () => {
		const stream = createStream();
		await assert.rejects(join(stream));
		const inFlight = new Deferred<Response>();
		fetchStub.onSecondCall().returns(inFlight.promise);
		const waiting = [join(stream), join(createStream(), true, true)];
		await clock.tickAsync(119999);
		assert.equal(fetchStub.callCount, 1);
		await clock.tickAsync(1);
		assert.equal(fetchStub.callCount, 2, "the shared request is in flight");
		const duringRequest = join(createStream());
		inFlight.resolve(success());
		await Promise.all([...waiting, duringRequest]);
		assert.equal(fetchStub.callCount, 2);
	});

	it("does not gate another document or independently scoped client", async () => {
		await assert.rejects(join(createStream()));
		await join(createStream({ ...resolvedUrl, itemId: "other", hashedDocumentId: "other" }));
		await join(createStream(resolvedUrl, new NonPersistentCache()));
		assert.equal(fetchStub.callCount, 3);
	});

	it("keeps a pending join waiting for shared work after disposal", async () => {
		const stream = createStream();
		await assert.rejects(join(stream));
		let settled = false;
		const next = join(stream).then(
			() => {
				settled = true;
				return true;
			},
			() => {
				settled = true;
				return false;
			},
		);
		await clock.tickAsync(0);
		stream.dispose();
		await clock.tickAsync(0);
		assert.equal(settled, false, "disposal does not settle the pending join");
		await clock.tickAsync(119999);
		assert.equal(fetchStub.callCount, 1);
		await clock.tickAsync(1);
		assert.equal(await next, true, "the join still receives the shared result");
		assert.equal(fetchStub.callCount, 2);
	});

	it("does not schedule an unusable Retry-After deadline", async () => {
		clock.setSystemTime(1000);
		const logger = new MockLogger();
		const error = createOdspNetworkError("throttle", 429, Number.MAX_SAFE_INTEGER / 1000);
		await assert.rejects(
			cache.sessionJoinCache.addOrGet(
				"document",
				async () => {
					throw error;
				},
				{ logger: logger.toTelemetryLogger(), caller: "initialConnect" },
			),
			(actual: unknown) => actual === error,
		);
		assert.equal(clock.countTimers(), 0);
		assert.ok(
			logger.events.some(
				(event) => event.eventName === "JoinSessionThrottleInvalidRetryAfter",
			),
		);
		await cache.sessionJoinCache.addOrGet("document", async () => ({
			entryTime: Date.now(),
			joinSessionResponse: response,
		}));
	});

	it("rounds fractional milliseconds up without shortening Retry-After", async () => {
		await assert.rejects(
			cache.sessionJoinCache.addOrGet("document", async () => {
				throw createOdspNetworkError("throttle", 429, 0.0015);
			}),
		);
		let fetched = false;
		const waiting = cache.sessionJoinCache.addOrGet("document", async () => {
			fetched = true;
			return { entryTime: Date.now(), joinSessionResponse: response };
		});
		await clock.tickAsync(1);
		assert.equal(fetched, false);
		await clock.tickAsync(1);
		await waiting;
		assert.equal(clock.countTimers(), 0);
	});

	it("waits through long deadlines without overflowing setTimeout", async () => {
		const maximumTimerDelayMs = 2 ** 31 - 1;
		await assert.rejects(
			cache.sessionJoinCache.addOrGet("document", async () => {
				throw createOdspNetworkError("throttle", 429, (maximumTimerDelayMs + 1000) / 1000);
			}),
		);
		let completed = false;
		const waiting = cache.sessionJoinCache.addOrGet("document", async () => {
			completed = true;
			return { entryTime: Date.now(), joinSessionResponse: response };
		});
		await clock.tickAsync(maximumTimerDelayMs);
		assert.equal(completed, false);
		await clock.tickAsync(1000);
		await waiting;
		assert.equal(clock.countTimers(), 0);
	});

	it("keeps the maximum deadline when overlapping requests fail out of order", async () => {
		const firstResponse = new Deferred<Response>();
		fetchStub.onFirstCall().returns(firstResponse.promise);
		const first = assert.rejects(join(createStream()));
		await clock.tickAsync(0);
		cache.sessionJoinCache.remove(getJoinSessionCacheKey(resolvedUrl));
		fetchStub.onSecondCall().resolves(throttle(120));
		await assert.rejects(join(createStream()));
		await clock.tickAsync(1000);
		firstResponse.resolve(throttle(5));
		await first;
		const next = join(createStream());
		await clock.tickAsync(118999);
		assert.equal(fetchStub.callCount, 2);
		await clock.tickAsync(1);
		await next;
		assert.equal(fetchStub.callCount, 3);
	});

	it("uses the rejection time, not the originating request start, for Retry-After", async () => {
		const pending = new Deferred<Response>();
		fetchStub.onFirstCall().returns(pending.promise);
		const failed = assert.rejects(join(createStream()));
		await clock.tickAsync(30000);
		pending.resolve(throttle(120));
		await failed;
		const next = join(createStream());
		await clock.tickAsync(119999);
		assert.equal(fetchStub.callCount, 1);
		await clock.tickAsync(1);
		await next;
	});

	it("does not mistake a generic retry delay for a server throttle", async () => {
		fetchStub
			.onFirstCall()
			.resolves(new Response("{}", { status: 503, headers: { "retry-after": "120" } }));
		await assert.rejects(join(createStream()));
		await join(createStream());
		assert.equal(fetchStub.callCount, 2);
	});

	it("stores the delayed promise immediately and does not use deadline cleanup timers", async () => {
		const key = getJoinSessionCacheKey(resolvedUrl);
		await assert.rejects(
			cache.sessionJoinCache.addOrGet(key, async () => {
				throw createOdspNetworkError("throttle", 429, 120);
			}),
		);
		assert.equal(cache.sessionJoinCache.get(key), undefined);
		assert.equal(cache.sessionJoinCache.has(key), false);
		assert.equal(clock.countTimers(), 0, "a deadline alone does not need a timer");
		let requests = 0;
		const execute = async (): Promise<{
			entryTime: number;
			joinSessionResponse: typeof response;
		}> => {
			requests++;
			return { entryTime: Date.now(), joinSessionResponse: response };
		};
		const first = cache.sessionJoinCache.addOrGet(key, execute);
		const cached = cache.sessionJoinCache.get(key);
		assert.notEqual(cached, undefined, "get sees the promise before waiting begins");
		assert.equal(cache.sessionJoinCache.has(key), true);
		const second = cache.sessionJoinCache.addOrGet(key, execute);
		assert.equal(cache.sessionJoinCache.get(key), cached);
		await clock.tickAsync(119999);
		assert.equal(requests, 0);
		assert.equal(clock.countTimers(), 1, "coalesced callers share one waiting timer");
		await clock.tickAsync(1);
		await Promise.all([first, second]);
		assert.equal(requests, 1);
		assert.equal(clock.countTimers(), 0);
	});

	it("rechecks an extended deadline when the shared waiting timer wakes", async () => {
		const pending = new Deferred<Response>();
		fetchStub.onFirstCall().returns(pending.promise);
		const older = assert.rejects(join(createStream()));
		await clock.tickAsync(0);
		cache.sessionJoinCache.remove(getJoinSessionCacheKey(resolvedUrl));
		fetchStub.onSecondCall().resolves(throttle(120));
		const stream = createStream();
		await assert.rejects(join(stream));
		const next = join(stream);
		await clock.tickAsync(60000);
		pending.resolve(throttle(120));
		await older;
		await clock.tickAsync(119999);
		assert.equal(fetchStub.callCount, 2);
		await clock.tickAsync(1);
		await next;
		assert.equal(fetchStub.callCount, 3);
		stream.dispose();
		assert.equal(clock.countTimers(), 0);
	});

	it("keeps the deadline when invalidating a promise that is waiting for it", async () => {
		const key = getJoinSessionCacheKey(resolvedUrl);
		await assert.rejects(join(createStream()));
		assert.equal(cache.sessionJoinCache.remove(key), false);
		const invalidated = join(createStream());
		await clock.tickAsync(1000);
		assert.equal(cache.sessionJoinCache.remove(key), true);
		assert.equal(cache.sessionJoinCache.has(key), false);
		const next = join(createStream());
		await clock.tickAsync(118999);
		assert.equal(fetchStub.callCount, 1);
		await clock.tickAsync(1);
		await Promise.all([invalidated, next]);
		assert.equal(fetchStub.callCount, 3, "invalidated work still completes for its callers");
	});

	it("rechecks the current entry when a deadline is replaced after expiring", async () => {
		const key = getJoinSessionCacheKey(resolvedUrl);
		const stale = new Deferred<Response>();
		fetchStub.onFirstCall().returns(stale.promise);
		const staleJoin = assert.rejects(join(createStream()));
		await clock.tickAsync(0);
		cache.sessionJoinCache.remove(key);
		fetchStub.onSecondCall().resolves(throttle(120));
		await assert.rejects(join(createStream()));
		const invalidated = join(createStream());
		await clock.tickAsync(0);
		cache.sessionJoinCache.remove(key);
		// Move the wall clock past the deadline without firing the waiting timer.
		clock.setSystemTime(Date.now() + 120000);
		stale.resolve(throttle(300));
		await staleJoin;
		const replacement = join(createStream());
		await clock.tickAsync(299999);
		assert.equal(fetchStub.callCount, 2, "the earlier waiter observes the new deadline");
		await clock.tickAsync(1);
		await Promise.all([invalidated, replacement]);
		assert.equal(fetchStub.callCount, 4);
	});

	it("does not schedule a timer when the deadline passes before the wait is scheduled", async () => {
		const logger = new MockLogger();
		// Each read advances the wall clock, as elapsed execution time would.
		let elapsedMs = 0;
		stub(Date, "now").callsFake(() => clock.now + elapsedMs++);
		for (let retryAfterMs = 1; retryAfterMs <= 10; retryAfterMs++) {
			const key = `document${retryAfterMs}`;
			const earliestDeadline = Date.now() + retryAfterMs;
			await assert.rejects(
				cache.sessionJoinCache.addOrGet(key, async () => {
					throw createOdspNetworkError("throttle", 429, retryAfterMs / 1000);
				}),
			);
			let requestedAt: number | undefined;
			const next = cache.sessionJoinCache.addOrGet(
				key,
				async () => {
					requestedAt = Date.now();
					return { entryTime: requestedAt, joinSessionResponse: response };
				},
				{ logger: logger.toTelemetryLogger(), caller: "reconnect" },
			);
			await clock.tickAsync(20);
			await next;
			assert.ok(requestedAt !== undefined && requestedAt > earliestDeadline);
		}
		const scheduled = logger.events
			.filter((event) => event.eventName.endsWith("JoinSessionThrottleWait"))
			.map((event) => event.scheduledDelayMs);
		assert.ok(scheduled.length > 0);
		assert.deepEqual(
			scheduled.filter((delay) => typeof delay !== "number" || delay <= 0),
			[],
		);
	});

	it("does not let an older failed request evict a replacement promise", async () => {
		const key = getJoinSessionCacheKey(resolvedUrl);
		const older = new Deferred<{
			entryTime: number;
			joinSessionResponse: typeof response;
		}>();
		const failed = assert.rejects(
			cache.sessionJoinCache.addOrGet(key, async () => older.promise),
		);
		cache.sessionJoinCache.remove(key);
		const replacement = cache.sessionJoinCache.addOrGet(key, async () => ({
			entryTime: Date.now(),
			joinSessionResponse: response,
		}));
		const cached = cache.sessionJoinCache.get(key);
		older.reject(new Error("older failure"));
		await failed;
		await replacement;
		assert.equal(cache.sessionJoinCache.get(key), cached);
	});

	it("keeps inherited synchronous insertion and value methods on the same cache state", async () => {
		const key = getJoinSessionCacheKey(resolvedUrl);
		const cachedResponse = { entryTime: Date.now(), joinSessionResponse: response };
		await assert.rejects(
			cache.sessionJoinCache.addOrGet(key, async () => {
				throw createOdspNetworkError("throttle", 429, 120);
			}),
		);
		let requests = 0;
		assert.equal(
			cache.sessionJoinCache.add(key, async () => {
				requests++;
				return cachedResponse;
			}),
			true,
		);
		assert.equal(cache.sessionJoinCache.addValue(key, cachedResponse), false);
		const waiting = cache.sessionJoinCache.addValueOrGet(key, cachedResponse);
		await clock.tickAsync(119999);
		assert.equal(requests, 0);
		await clock.tickAsync(1);
		assert.equal(await waiting, cachedResponse);
		assert.equal(requests, 1);
		assert.equal(cache.sessionJoinCache.remove(key), true);
		assert.equal(cache.sessionJoinCache.get(key), undefined);
		assert.equal(cache.sessionJoinCache.addValue(key, cachedResponse), true);
		assert.equal(await cache.sessionJoinCache.get(key), cachedResponse);
	});

	it("installs the promise before invoking a reentrant fetch callback", async () => {
		const key = getJoinSessionCacheKey(resolvedUrl);
		let calls = 0;
		const result = { entryTime: Date.now(), joinSessionResponse: response };
		let second: ReturnType<typeof cache.sessionJoinCache.addOrGet> | undefined;
		const first = cache.sessionJoinCache.addOrGet(key, async () => {
			calls++;
			second = cache.sessionJoinCache.addOrGet(key, async () => {
				calls++;
				return result;
			});
			assert.notEqual(cache.sessionJoinCache.get(key), undefined);
			return result;
		});
		assert.equal(await first, result);
		assert.equal(await second, result);
		assert.equal(calls, 1);
	});

	it("keeps legacy behavior for a plain PromiseCache supplied through the exported interface", async () => {
		const legacyCache: INonPersistentCache = {
			...cache,
			sessionJoinCache: new PromiseCache(),
		};
		await assert.rejects(join(createStream(resolvedUrl, legacyCache)), {
			errorType: "throttlingError",
		});
		await Promise.all([
			join(createStream(resolvedUrl, legacyCache)),
			join(createStream(resolvedUrl, legacyCache)),
		]);
		assert.equal(fetchStub.callCount, 2, "requests coalesce without a throttle wait");
	});

	for (const seconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
		it(`does not delay a subsequent request for an unusable Retry-After of ${seconds}`, async () => {
			const error = createOdspNetworkError("throttle", 429, seconds);
			await assert.rejects(
				cache.sessionJoinCache.addOrGet("document", async () => {
					throw error;
				}),
				(actual: unknown) => actual === error,
			);
			const next = await cache.sessionJoinCache.addOrGet("document", async () => ({
				entryTime: Date.now(),
				joinSessionResponse: response,
			}));
			assert.equal(next.joinSessionResponse, response);
			assert.equal(clock.countTimers(), 0);
		});
	}

	it("uses an expired deadline without requiring a cleanup timer to run", async () => {
		await assert.rejects(
			cache.sessionJoinCache.addOrGet("document", async () => {
				throw createOdspNetworkError("throttle", 429, 120);
			}),
		);
		clock.setSystemTime(120000);
		const next = await cache.sessionJoinCache.addOrGet("document", async () => ({
			entryTime: Date.now(),
			joinSessionResponse: response,
		}));
		assert.equal(next.joinSessionResponse, response);
		assert.equal(clock.countTimers(), 0);
	});
});
