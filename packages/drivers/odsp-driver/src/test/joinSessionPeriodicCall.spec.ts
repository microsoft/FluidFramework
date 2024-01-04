/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IClient } from "@fluidframework/protocol-definitions";
import { ISocketStorageDiscovery } from "@fluidframework/odsp-driver-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { stub, useFakeTimers, SinonFakeTimers } from "sinon";
import * as odspDocumentDeltaConnection from "../odspDocumentDeltaConnection";
import * as joinSession from "../vroom";
import { OdspDocumentServiceFactory } from "../odspDocumentServiceFactory";
import { LocalPersistentCache } from "../odspCache";
import { OdspFluidDataStoreLocator } from "../contractsPublic";
import { createOdspUrl } from "../createOdspUrl";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { OdspDocumentService } from "../odspDocumentService";
import { OdspDocumentDeltaConnection } from "../odspDocumentDeltaConnection";

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

	async function tickClock(tickValue: number) {
		clock.tick(tickValue);

		// Yield the event loop because the outbound op will be processed asynchronously.
		await yieldEventLoop();
	}

	function addJoinSessionStub(time: number) {
		joinSessionResponse.refreshSessionDurationSeconds = time;
		const joinSessionStub = stub(joinSession, "fetchJoinSession").callsFake(
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
		const locator: OdspFluidDataStoreLocator = { driveId, itemId, siteUrl, dataStorePath: "/" };
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
			dispose: (error) => {},
			disposed: false,
			submit: (message) => {},
			submitSignal: (message) => {},
			on: (op: any, func?: any) => {},
			once: (op: any, func?: any) => {},
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

	afterEach(() => {
		clock.reset();
	});

	after(() => {
		clock.restore();
	});
});
