/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { stub, type SinonStub } from "sinon";
import type { IResolvedUrl } from "@fluidframework/driver-definitions";
import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils/internal";
import { IOdspResolvedUrl, ISocketStorageDiscovery } from "@fluidframework/odsp-driver-definitions";
import { OdspDocumentServiceFactory } from "../odspDocumentServiceFactory.js";
import { getJoinSessionCacheKey } from "../odspUtils.js";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { Socket } from "socket.io-client";
import type { IClient } from "@fluidframework/protocol-definitions";
import { createOdspUrl } from "../createOdspUrl";
// import { EpochTracker } from "../epochTracker";
// import { LocalPersistentCache } from "../odspCache";
// import { OdspDocumentDeltaConnection } from "../odspDocumentDeltaConnection";
import { OdspDocumentServiceFactory } from "../odspDocumentServiceFactory";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { getJoinSessionCacheKey } from "../odspUtils";
import * as socketModule from "../socketModule";
import * as joinSession from "../vroom";
// import { getHashedDocumentId } from "..";
// eslint-disable-next-line import/no-internal-modules
import { ClientSocketMock } from "./socketTests/socketMock";

describe("expose joinSessionInfo Tests", () => {
	const siteUrl = "https://www.localhost.xxx";
	const driveId = "driveId";
	const itemId = "itemId";

	const resolvedUrl = {
		siteUrl,
		driveId,
		itemId,
		odspResolvedUrl: true,
	} as unknown as IOdspResolvedUrl;

	const joinSessionResponse: ISocketStorageDiscovery = {
		deltaStorageUrl: "https://fake/deltaStorageUrl",
		deltaStreamSocketUrl: "https://localhost:3001",
		id: "id",
		tenantId: "tenantId",
		snapshotStorageUrl: "https://fake/snapshotStorageUrl",
		socketToken: "token", // providing socket token here so that the tests can bypass the need for token fetcher callback
		refreshSessionDurationSeconds: 5,
	};
	const odspDocumentServiceFactory = new OdspDocumentServiceFactory(
		async (_options) => "token",
		async (_options) => "token",
	);

	// async function mockSocket<T>(_response: Socket, callback: () => Promise<T>): Promise<T> {
	// 	const getSocketCreationStub = stub(socketModule, "SocketIOClientStatic");
	// 	getSocketCreationStub.returns(_response);
	// 	try {
	// 		return await callback();
	// 	} finally {
	// 		getSocketCreationStub.restore();
	// 	}
	// }

	function addJoinSessionStub(): SinonStub {
		const joinSessionStub = stub(joinSession, "fetchJoinSession").callsFake(
			async () => joinSessionResponse,
		);
		return joinSessionStub;
	}

	it("Response missing in join session cache", async () => {
		const info = await odspDocumentServiceFactory.getRelayServiceSessionInfo(resolvedUrl);
		assert(info === undefined, "no cached response");
	});

	it("Response present in join session cache", async () => {
		// eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		odspDocumentServiceFactory["nonPersistentCache"].sessionJoinCache.add(
			getJoinSessionCacheKey(resolvedUrl),
			async () => {
				return { entryTime: Date.now(), joinSessionResponse };
			},
		);
		const info = await odspDocumentServiceFactory.getRelayServiceSessionInfo(resolvedUrl);
		assert.deepStrictEqual(info, joinSessionResponse, "cached response should be present");
	});

	it("should throw error is resolved url is not odspResolvedUrl", async () => {
		let failed = false;
		try {
			await odspDocumentServiceFactory.getRelayServiceSessionInfo({
				...resolvedUrl,
				odspResolvedUrl: false,
			} as unknown as IResolvedUrl);
		} catch {
			failed = true;
		}
		assert(failed, "resolved url not correct");
	});

	it("Connect document error on connection - clears cache", async () => {

		// joinSession stub which will be called by connectToDeltaStream below
		// when invoked, this step should save the joinSession response in the cache
		const joinSessionStub = addJoinSessionStub();

		// Setup for mocking socket a error when connectToDeltaStream gets executed below
		const logger = new MockLogger().toTelemetryLogger();
		const locator = { driveId, itemId, siteUrl, dataStorePath: "/" };
		const request = createOdspUrl(locator);
		const resolver = new OdspDriverUrlResolver();
		const resolvedUrl = await resolver.resolve({ url: request });
		const service = await odspDocumentServiceFactory.createDocumentService(resolvedUrl, logger);
		const errorToThrow = createOdspNetworkError("TestSocketError", 429);
		const socket = new ClientSocketMock({
			connect_document: { eventToEmit: "connect_document_error", errorToThrow },
		});
		// const localCache = new LocalPersistentCache();
		// const socketReferenceKeyPrefix = "prefix";
		// const epochTracker = new EpochTracker(
		// 	localCache,
		// 	{
		// 		docId: await getHashedDocumentId(driveId, itemId),
		// 		resolvedUrl,
		// 	},
		// 	logger,
		// );
		const client: IClient = {
			mode: "read",
			details: { capabilities: { interactive: true } },
			permission: [],
			user: { id: "id" },
			scopes: [],
		};
		
		const getSocketCreationStub = stub(socketModule, "SocketIOClientStatic");
		getSocketCreationStub.returns(socket as unknown as Socket);
		try {
			// await mockSocket(socket as unknown as Socket, async () =>
			// 	OdspDocumentDeltaConnection.create(
			// 		"tenantId",
			// 		"documentId",
			// 		"token",
			// 		client,
			// 		"https://webSocketUrl",
			// 		logger,
			// 		60000,
			// 		epochTracker,
			// 		socketReferenceKeyPrefix,
			// 	),
			// );
			// await OdspDocumentDeltaConnection.create(
			// 	"tenantId",
			// 	"documentId",
			// 	"token",
			// 	client,
			// 	"https://webSocketUrl",
			// 	logger,
			// 	60000,
			// 	epochTracker,
			// 	socketReferenceKeyPrefix,
			// );
			
			// connectToDeltaStream calls joinSession and then createDeltaConnection which are mocked above.
			await service.connectToDeltaStream(client);
		} catch (error) {
			assert(
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				(error as any).isSocketError === false,
				"'connect_document_error' is not a socket error. 'isSocketError' should be false",
			);

			const info = await odspDocumentServiceFactory.getRelayServiceSessionInfo(resolvedUrl);
			assert(
				info === undefined,
				"joinSession cache should get cleared when 'connect_document_error' occurs",
			);
		} finally{
			getSocketCreationStub.restore();
			joinSessionStub.restore();
		}
		
	});
});
