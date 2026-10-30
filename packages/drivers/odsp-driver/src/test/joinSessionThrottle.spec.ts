/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { Deferred } from "@fluidframework/core-utils/internal";
import type { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";
import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils/internal";
import {
	createChildMonitoringContext,
	MockLogger,
} from "@fluidframework/telemetry-utils/internal";
import {
	createStubInstance,
	restore,
	stub,
	useFakeTimers,
	type SinonFakeTimers,
	type SinonStub,
} from "sinon";

import { createOdspUrl } from "../createOdspUrl.js";
import { createOdspCacheAndTracker, EpochTracker } from "../epochTracker.js";
import { getJoinSessionThrottle } from "../joinSessionThrottle.js";
import { LocalPersistentCache, NonPersistentCache } from "../odspCache.js";
import { OdspDelayLoadedDeltaStream } from "../odspDelayLoadedDeltaStream.js";
import { OdspDocumentDeltaConnection } from "../odspDocumentDeltaConnection.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import { getJoinSessionCacheKey } from "../odspUtils.js";

describe("join-session throttle coordination", () => {
	let clock: SinonFakeTimers;
	let fetchStub: SinonStub<Parameters<typeof fetch>, ReturnType<typeof fetch>>;
	let cache: NonPersistentCache;
	let resolvedUrl: IOdspResolvedUrl;
	let logger: MockLogger;
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
		sharedCache = cache,
		useBaseTracker = false,
		getWebsocketToken?: () => Promise<string>,
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
			getWebsocketToken,
			mc,
			odspCache,
			{},
			useBaseTracker
				? new EpochTracker(
						odspCache.persistedCache,
						{ docId: url.hashedDocumentId, resolvedUrl: url },
						logger.toTelemetryLogger(),
					)
				: epochTracker,
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
	): Promise<unknown> {
		// eslint-disable-next-line @typescript-eslint/dot-notation
		return stream["joinSessionCore"](
			socketToken,
			{ refresh },
			refresh && !socketToken,
			undefined,
		);
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
		logger = new MockLogger();
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

	it("correlates independent callers, the shared gate, HTTP attempts, and terminal outcomes", async () => {
		const stream = createStream();
		await assert.rejects(join(stream));
		const next = join(stream, true, true);
		await clock.tickAsync(120000);
		await next;
		const starts = logger.events.filter((event) =>
			event.eventName.endsWith("OdspRequestStart"),
		);
		const ends = logger.events.filter((event) => event.eventName.endsWith("OdspOperationEnd"));
		assert.equal(starts.length, 2);
		assert.equal(ends.length, 2);
		assert.notEqual(starts[0].odspOperationId, starts[1].odspOperationId);
		assert.equal(starts[0].odspAttemptNumber, 1);
		assert.equal(starts[1].odspAttemptNumber, 1);
		assert.equal(starts[0].odspTargetId, starts[1].odspTargetId);
		assert.equal(starts[0].joinSessionCaller, "initialConnect");
		assert.equal(starts[1].joinSessionCaller, "socketTokenRefresh");
		assert.equal(ends[0].outcome, "failed");
		assert.equal(ends[1].outcome, "succeeded");
		const waited = logger.events.find((event) =>
			event.eventName.endsWith("JoinSessionThrottleWait_end"),
		);
		assert.equal(waited?.odspOperationId, starts[1].odspOperationId);
		assert.equal(waited?.scheduledDelayMs, 120000);
		assert.equal(waited?.observedDelayMs, 120000);
		const throttled = logger.events.find((event) =>
			event.eventName.endsWith("JoinSessionThrottle"),
		);
		assert.equal(throttled?.odspOperationId, starts[0].odspOperationId);
		assert.equal(throttled?.odspAttemptId, starts[0].odspAttemptId);
	});

	it("keeps a connection's join-session token retry in the original caller operation", async () => {
		fetchStub.onFirstCall().resolves(new Response("{}", { status: 401 }));
		fetchStub.callsFake(
			async () =>
				new Response(
					JSON.stringify({
						...response,
						socketToken: "******",
					}),
					{ headers: { "content-type": "application/json", "x-fluid-epoch": "epoch" } },
				),
		);
		const socket = stub(OdspDocumentDeltaConnection, "create").rejects(
			new Error("synthetic socket failure"),
		);
		await assert.rejects(
			createStream(resolvedUrl, cache, true).connectToDeltaStream({
				mode: "read",
				details: { capabilities: { interactive: true } },
				permission: [],
				user: { id: "id" },
				scopes: [],
			}),
			/synthetic socket failure/,
		);
		assert.equal(socket.callCount, 1);
		const requests = logger.events.filter((event) =>
			event.eventName.endsWith("OdspRequestStart"),
		);
		assert.equal(requests.length, 2);
		assert.equal(requests[0].odspOperationId, requests[1].odspOperationId);
		assert.deepEqual(
			requests.map((event) => event.odspAttemptNumber),
			[1, 2],
		);
		assert.deepEqual(
			requests.map((event) => event.joinSessionCaller),
			["initialConnect", "initialConnect"],
		);
		assert.deepEqual(
			requests.map((event) => event.joinSessionAttemptCaller),
			["initialConnect", "socketTokenRefresh"],
		);
		assert.equal(
			logger.events.filter((event) => event.eventName.endsWith("OdspOperationEnd")).length,
			1,
		);
	});

	it("does not start a socket connection after disposal while its token is pending", async () => {
		fetchStub.onFirstCall().resolves(success());
		const token = new Deferred<string>();
		const stream = createStream(resolvedUrl, cache, true, async () => token.promise);
		const socket = stub(OdspDocumentDeltaConnection, "create").rejects(
			new Error("unexpected socket connection"),
		);
		const connection = assert.rejects(
			stream.connectToDeltaStream({
				mode: "read",
				details: { capabilities: { interactive: true } },
				permission: [],
				user: { id: "id" },
				scopes: [],
			}),
			/disposed/i,
		);
		await clock.tickAsync(0);
		stream.dispose();
		token.resolve("******");
		await connection;
		assert.equal(socket.callCount, 0);
		const ends = logger.events.filter((event) => event.eventName.endsWith("OdspOperationEnd"));
		assert.equal(ends.length, 1);
		assert.equal(ends[0].outcome, "abandoned");
	});

	it("disposes a socket that completes after its operation was abandoned", async () => {
		fetchStub.onFirstCall().resolves(
			new Response(
				JSON.stringify({
					...response,
					socketToken: "******",
				}),
				{ headers: { "content-type": "application/json", "x-fluid-epoch": "epoch" } },
			),
		);
		const pending = new Deferred<OdspDocumentDeltaConnection>();
		const socket = stub(OdspDocumentDeltaConnection, "create").returns(pending.promise);
		const stream = createStream(resolvedUrl, cache, true);
		const connection = assert.rejects(
			stream.connectToDeltaStream({
				mode: "read",
				details: { capabilities: { interactive: true } },
				permission: [],
				user: { id: "id" },
				scopes: [],
			}),
			/disposed/i,
		);
		await clock.tickAsync(0);
		assert.equal(socket.callCount, 1);
		stream.dispose();
		const lateConnection = createStubInstance(OdspDocumentDeltaConnection);
		pending.resolve(lateConnection);
		await connection;
		assert.equal(lateConnection.dispose.callCount, 1);
	});

	it("accounts for coalesced callers without inventing HTTP attempts", async () => {
		const pending = new Deferred<Response>();
		fetchStub.onFirstCall().returns(pending.promise);
		const first = join(createStream());
		await clock.tickAsync(0);
		const second = join(createStream(), true);
		await clock.tickAsync(0);
		pending.resolve(success());
		await Promise.all([first, second]);
		const operations = logger.events.filter((event) =>
			event.eventName.endsWith("OdspOperationStart"),
		);
		const requests = logger.events.filter((event) =>
			event.eventName.endsWith("OdspRequestStart"),
		);
		const coalesced = logger.events.find((event) =>
			event.eventName.endsWith("OdspOperationCoalesced"),
		);
		assert.equal(operations.length, 2);
		assert.equal(requests.length, 1);
		assert.notEqual(operations[0].odspOperationId, operations[1].odspOperationId);
		assert.equal(coalesced?.sharedOperationId, operations[0].odspOperationId);
		assert.equal(coalesced?.odspOperationId, operations[1].odspOperationId);
	});

	it("retains originating request IDs through error fan-out", async () => {
		await join(createStream()).catch((error: unknown) => {
			for (const layer of ["storage", "connection", "container", "runner"]) {
				logger.toTelemetryLogger().sendErrorEvent({ eventName: layer }, error);
			}
		});
		const start = logger.events.find((event) => event.eventName.endsWith("OdspRequestStart"));
		assert.ok(start?.odspOperationId);
		assert.ok(start.odspAttemptId);
		for (const layer of ["storage", "connection", "container", "runner"]) {
			const event = logger.events.find((entry) => entry.eventName === layer);
			assert.equal(event?.odspOperationId, start.odspOperationId);
			assert.equal(event?.odspAttemptId, start.odspAttemptId);
		}
	});

	it("records abandonment once and does not claim replacement success as recovery", async () => {
		const original = createStream();
		await assert.rejects(join(original));
		const waiting = assert.rejects(join(original), /disposed/i);
		await clock.tickAsync(1000);
		original.dispose();
		await waiting;
		const replacement = join(createStream());
		await clock.tickAsync(119000);
		await replacement;
		const ends = logger.events.filter((event) => event.eventName.endsWith("OdspOperationEnd"));
		assert.equal(ends.length, 3);
		assert.equal(ends[1].outcome, "abandoned");
		assert.equal(ends[2].outcome, "succeeded");
		assert.notEqual(ends[1].odspOperationId, ends[2].odspOperationId);
		assert.notEqual(ends[1].odspServiceId, ends[2].odspServiceId);
	});

	for (const [name, refresh, socketToken] of [
		["reconnect", false, false],
		["periodic refresh", true, false],
		["socket-token refresh", true, true],
	] as const) {
		it(`retains Retry-After after rejection for ${name}`, async () => {
			const stream = createStream();
			await assert.rejects(join(stream), { errorType: "throttlingError" });
			const next = join(stream, refresh, socketToken);
			await clock.tickAsync(119999);
			assert.equal(fetchStub.callCount, 1, "no request before the server deadline");
			await clock.tickAsync(1);
			await next;
			assert.equal(fetchStub.callCount, 2, "the delay must not be applied twice");
		});
	}

	it("coalesces callers both in flight and while waiting for a deadline", async () => {
		const stream = createStream();
		await assert.rejects(join(stream));
		const first = join(stream);
		const second = join(createStream(), true, true);
		await clock.tickAsync(119999);
		assert.equal(fetchStub.callCount, 1);
		await clock.tickAsync(1);
		await Promise.all([first, second]);
		assert.equal(fetchStub.callCount, 2);
	});

	it("does not gate another document or independently scoped client", async () => {
		await assert.rejects(join(createStream()));
		await join(createStream({ ...resolvedUrl, itemId: "other", hashedDocumentId: "other" }));
		await join(createStream(resolvedUrl, new NonPersistentCache()));
		assert.equal(fetchStub.callCount, 3);
	});

	it("cancels a disposed wait without cancelling another service's wait", async () => {
		const first = createStream();
		const second = createStream();
		await assert.rejects(join(first));
		const cancelled = assert.rejects(join(first), /disposed/i);
		const surviving = join(second);
		await clock.tickAsync(1000);
		first.dispose();
		await cancelled;
		assert.equal(fetchStub.callCount, 1);
		await clock.tickAsync(119000);
		await surviving;
		assert.equal(fetchStub.callCount, 2);
	});

	it("never starts a join-session request after disposal", async () => {
		const stream = createStream();
		stream.dispose();
		await assert.rejects(join(stream), /disposed/i);
		assert.equal(fetchStub.callCount, 0);
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

	it("rechecks the deadline after leaving the HTTP concurrency queue", async () => {
		fetchStub.onFirstCall().callsFake(async () => success());
		const stream = createStream();
		const release = new Deferred<void>();
		// eslint-disable-next-line @typescript-eslint/dot-notation
		const limiter = stream["epochTracker"].rateLimiter;
		const occupied = Array.from({ length: 24 }, async () =>
			limiter.schedule(async () => release.promise),
		);
		const next = join(stream);
		await clock.tickAsync(0);
		assert.equal(limiter.waitQueueLength, 1);
		const key = JSON.stringify([
			new URL(resolvedUrl.siteUrl).origin,
			getJoinSessionCacheKey(resolvedUrl),
		]);
		getJoinSessionThrottle(cache).record(
			key,
			createOdspNetworkError("throttle", 429, 120),
			new MockLogger().toTelemetryLogger(),
		);
		release.resolve();
		await clock.tickAsync(119999);
		assert.equal(fetchStub.callCount, 0);
		await clock.tickAsync(1);
		await Promise.all([...occupied, next]);
		assert.equal(fetchStub.callCount, 1);
	});

	it("extends an already waiting caller and expires all throttle timers", async () => {
		const stream = createStream();
		await assert.rejects(join(stream));
		const next = join(stream);
		await clock.tickAsync(60000);
		const key = JSON.stringify([
			new URL(resolvedUrl.siteUrl).origin,
			getJoinSessionCacheKey(resolvedUrl),
		]);
		getJoinSessionThrottle(cache).record(
			key,
			createOdspNetworkError("throttle", 429, 120),
			new MockLogger().toTelemetryLogger(),
		);
		await clock.tickAsync(119999);
		assert.equal(fetchStub.callCount, 1);
		await clock.tickAsync(1);
		await next;
		stream.dispose();
		assert.equal(clock.countTimers(), 0);
	});
});
