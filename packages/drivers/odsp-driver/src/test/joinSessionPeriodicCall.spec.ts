/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IClient } from "@fluidframework/driver-definitions";
import type { IAuthorizationError } from "@fluidframework/driver-definitions/internal";
import {
	type ISocketStorageDiscovery,
	OdspErrorTypes,
	type OdspResourceTokenFetchOptions,
} from "@fluidframework/odsp-driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { type SinonFakeTimers, type SinonStub, stub, useFakeTimers } from "sinon";

import type { OdspFluidDataStoreLocator } from "../contractsPublic.js";
import { createOdspUrl } from "../createOdspUrl.js";
import { mockify } from "../mockify.js";
import { LocalPersistentCache } from "../odspCache.js";
import * as odspDocumentDeltaConnection from "../odspDocumentDeltaConnection.js";
import type { OdspDocumentDeltaConnection } from "../odspDocumentDeltaConnection.js";
import type { OdspDocumentService } from "../odspDocumentService.js";
import { OdspDocumentServiceFactory } from "../odspDocumentServiceFactory.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import { fetchJoinSession } from "../vroom.js";

import {
	createClaimsChallengeHeader,
	createResponse,
	mockFetchMultiple,
	mockFetchOk,
} from "./mockFetch.js";

describe("joinSessions Tests", () => {
	let clock: SinonFakeTimers;
	const siteUrl = "https://www.localhost.xxx";
	const driveId = "driveId";
	const resolver = new OdspDriverUrlResolver();
	const itemId = "itemId";
	let service: OdspDocumentService;
	let logger: MockLogger;
	const client: IClient = {
		mode: "read",
		details: { capabilities: { interactive: true } },
		permission: [],
		user: { id: "id" },
		scopes: [],
	};
	let deltaConnection;
	const joinSessionResponse: ISocketStorageDiscovery = {
		deltaStorageUrl: "https://fake/deltaStorageUrl",
		deltaStreamSocketUrl: "https://localhost:3001",
		id: "id",
		tenantId: "tenantId",
		snapshotStorageUrl: "https://fake/snapshotStorageUrl",
		refreshSessionDurationSeconds: 100,
	};
	let odspDocumentServiceFactory: OdspDocumentServiceFactory;

	// Stash the real setTimeout because sinon fake timers will hijack it.
	const realSetTimeout = setTimeout;

	// function to yield control in the Javascript event loop.
	async function yieldEventLoop(): Promise<void> {
		await new Promise<void>((resolve) => {
			realSetTimeout(resolve, 0);
		});
	}

	async function tickClock(tickValue: number): Promise<void> {
		clock.tick(tickValue);

		// Yield the event loop because the outbound op will be processed asynchronously.
		await yieldEventLoop();
	}

	function addJoinSessionStub(time: number): SinonStub {
		joinSessionResponse.refreshSessionDurationSeconds = time;
		const joinSessionStub = stub(fetchJoinSession, mockify.key).callsFake(
			async () => joinSessionResponse,
		);
		return joinSessionStub;
	}

	before(async () => {
		clock = useFakeTimers();
	});

	beforeEach(async () => {
		odspDocumentServiceFactory = new OdspDocumentServiceFactory(
			async (_options) => "token",
			async (_options) => "token",
			new LocalPersistentCache(2000),
			{ snapshotOptions: { timeout: 2000 } },
		);
		const locator: OdspFluidDataStoreLocator = {
			driveId,
			itemId,
			siteUrl,
			dataStorePath: "/",
		};
		const request = createOdspUrl(locator);
		const resolvedUrl = await resolver.resolve({ url: request });
		logger = new MockLogger();
		service = (await odspDocumentServiceFactory.createDocumentService(
			resolvedUrl,
			logger,
		)) as OdspDocumentService;

		deltaConnection = {
			clientId: "clientId",
			existing: true,
			initialClients: [],
			initialMessages: [],
			initialSignals: [],
			version: "1.0",
			mode: "write",
			claims: {
				documentId: "docId",
				exp: 0,
				iat: 0,
				scopes: [],
				tenantId: "ten",
				ver: "ver",
				user: {
					id: "id",
				},
			},
			serviceConfiguration: {
				blockSize: 100,
				maxMessageSize: 16000,
				summary: {
					minIdleTime: 0,
					maxIdleTime: 0,
					maxAckWaitTime: 0,
					maxOps: 100,
					maxTime: 10,
				},
			},
			dispose: (): void => {},
			disposed: false,
			submit: (): void => {},
			submitSignal: (): void => {},
			on: (): void => {},
			once: (): void => {},
		};
	});

	it("Check periodic join session call", async () => {
		const createDeltaConnectionStub = stub(
			odspDocumentDeltaConnection.OdspDocumentDeltaConnection,
			"create",
		).callsFake(async () => deltaConnection as OdspDocumentDeltaConnection);
		let joinSessionStub = addJoinSessionStub(100);
		await service.connectToDeltaStream(client);
		createDeltaConnectionStub.restore();
		joinSessionStub.restore();
		assert(joinSessionStub.calledOnce, "Should called once on first try");

		// Prepare second response.
		joinSessionStub = addJoinSessionStub(90);
		// Tick 70 seconds so as to get second response.
		await tickClock(70000 - 1);
		assert(joinSessionStub.notCalled, "Should not be called in 69 sec");
		await tickClock(1);
		assert(joinSessionStub.calledOnce, "Should called once on second try");
		joinSessionStub.restore();

		// Prepare third response.
		joinSessionStub = addJoinSessionStub(30);
		// Tick 60 seconds so as to get third response.
		await tickClock(50000);
		assert(joinSessionStub.notCalled, "Should not be called in 50 sec");
		await tickClock(10000);
		assert(joinSessionStub.calledOnce, "Should called once on third try");
		joinSessionStub.restore();

		// Prepare fourth response.
		joinSessionStub = addJoinSessionStub(40);
		// Since last refresh seconds is less than 30 sec, we should not have
		// scheduled the refresh.
		await tickClock(100000);
		assert(joinSessionStub.notCalled, "Should not be called ever");
		joinSessionStub.restore();
	});

	it("Check periodic join session call does not lead to duplicate refresh", async () => {
		const createDeltaConnectionStub = stub(
			odspDocumentDeltaConnection.OdspDocumentDeltaConnection,
			"create",
		).callsFake(async () => deltaConnection as OdspDocumentDeltaConnection);
		let joinSessionStub = addJoinSessionStub(100);
		await service.connectToDeltaStream(client);
		createDeltaConnectionStub.restore();
		joinSessionStub.restore();
		assert(joinSessionStub.calledOnce, "Should called once on first try");

		// Prepare second response.
		joinSessionStub = addJoinSessionStub(90);
		// Tick 70 seconds so as to get second response.
		await tickClock(70000);
		assert(joinSessionStub.calledOnce, "Should called once on second try");
		joinSessionStub.restore();
		logger.assertMatchNone(
			[{ eventName: "OdspDriver:DuplicateJoinSessionRefresh" }],
			"No duplicate join session should be there",
		);
	});

	describe("Claims challenge on join session refresh", () => {
		const claims = '{"access_token":{"nbf":{"essential":true,"value":"1597959090"}}}';
		const wwwAuthenticate = createClaimsChallengeHeader(claims);

		/**
		 * Connects to the delta stream, then lets the scheduled join session refresh run.
		 * Each join session request in the refresh gets a claims challenge.
		 * @param requestCount - The number of join session requests that the refresh is expected to make.
		 */
		async function refreshWithClaimsChallenge(
			propagateClaimsChallenges: boolean,
			requestCount: number,
		): Promise<{
			refreshTokenFetches: OdspResourceTokenFetchOptions[];
			disposeErrors: unknown[];
		}> {
			const tokenFetches: OdspResourceTokenFetchOptions[] = [];
			const factory = new OdspDocumentServiceFactory(
				async (options) => {
					tokenFetches.push(options);
					return "token";
				},
				async (_options) => "token",
				new LocalPersistentCache(2000),
				{ snapshotOptions: { timeout: 2000 }, propagateClaimsChallenges },
			);
			const resolvedUrl = await resolver.resolve({
				url: createOdspUrl({ driveId, itemId, siteUrl, dataStorePath: "/" }),
			});
			const documentService = await factory.createDocumentService(resolvedUrl, logger);
			const refreshSessionDurationSeconds = 100;

			const disposeErrors: unknown[] = [];
			const connection = deltaConnection as {
				dispose: (error?: Error) => void;
				disposed: boolean;
			};
			connection.dispose = (error?: Error): void => {
				disposeErrors.push(error);
				connection.disposed = true;
			};
			const createDeltaConnectionStub = stub(
				odspDocumentDeltaConnection.OdspDocumentDeltaConnection,
				"create",
			).callsFake(async () => deltaConnection as OdspDocumentDeltaConnection);
			// Join the session with a mocked network request, not a stub of fetchJoinSession.
			// A successful request ends the wait that the epoch tracker adds after a 401 from join session
			// (JoinSessionSyncWait), as in a real session.
			await mockFetchOk(async () => documentService.connectToDeltaStream(client), {
				...joinSessionResponse,
				refreshSessionDurationSeconds,
			});
			createDeltaConnectionStub.restore();

			// The refresh runs before the session expires, so advancing the clock by the session duration runs it.
			// The refresh calls the real fetchJoinSession, and nothing is scheduled after it fails.
			tokenFetches.length = 0;
			await mockFetchMultiple(
				async () => tickClock(refreshSessionDurationSeconds * 1000),
				Array.from(
					{ length: requestCount },
					() => async () =>
						createResponse({ "www-authenticate": wwwAuthenticate }, undefined, 401),
				),
			);
			return { refreshTokenFetches: tokenFetches, disposeErrors };
		}

		it("ends the connection with the challenge when propagateClaimsChallenges is on", async () => {
			const { refreshTokenFetches, disposeErrors } = await refreshWithClaimsChallenge(
				true /* propagateClaimsChallenges */,
				1 /* requestCount */,
			);

			assert.deepStrictEqual(
				refreshTokenFetches.map((options) => options.claims),
				[undefined],
				"the host should not be asked for a token with the claims",
			);
			assert.strictEqual(disposeErrors.length, 1, "the connection should be disposed");
			const error = disposeErrors[0] as IAuthorizationError;
			assert.strictEqual(error.errorType, OdspErrorTypes.authorizationError);
			assert.strictEqual(error.claims, claims);
			assert.strictEqual(error.wwwAuthenticate, wwwAuthenticate);
			assert.strictEqual(error.canRetry, false);
		});

		it("keeps the connection when propagateClaimsChallenges is off", async () => {
			const { refreshTokenFetches, disposeErrors } = await refreshWithClaimsChallenge(
				false /* propagateClaimsChallenges */,
				2 /* requestCount */,
			);

			assert.deepStrictEqual(
				refreshTokenFetches.map((options) => options.claims),
				[undefined, claims],
				"the host should be asked for a token with the claims",
			);
			assert.strictEqual(disposeErrors.length, 0, "the connection should not be disposed");
		});
	});

	afterEach(() => {
		clock.reset();
	});

	after(() => {
		clock.restore();
	});
});
