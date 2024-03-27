/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { IResolvedUrl } from "@fluidframework/driver-definitions";
import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils/internal";
import { IOdspResolvedUrl, ISocketStorageDiscovery } from "@fluidframework/odsp-driver-definitions";
import type { IClient } from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { type SinonStub, stub } from "sinon";
import { Socket } from "socket.io-client";
import { createOdspUrl } from "../createOdspUrl.js";
import { OdspDocumentServiceFactory } from "../odspDocumentServiceFactory.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import { getJoinSessionCacheKey } from "../odspUtils.js";
import * as socketModule from "../socketModule.js";
import * as joinSession from "../vroom.js";
// eslint-disable-next-line import/no-internal-modules
import { ClientSocketMock } from "./socketTests/socketMock.js";

describe("expose joinSessionInfo Tests", () => {
	const siteUrl = "https://www.localhost.xxx";
	const driveId = "driveId";
	const itemId = "itemId";
	let socket: ClientSocketMock | undefined;

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

	function addJoinSessionStub(): SinonStub {
		const joinSessionStub = stub(joinSession, "fetchJoinSession").callsFake(
			async () => joinSessionResponse,
		);
		return joinSessionStub;
	}

	async function mockSocket<T>(_response: Socket, callback: () => Promise<T>): Promise<T> {
		const getSocketCreationStub = stub(socketModule, "SocketIOClientStatic");
		getSocketCreationStub.returns(_response);
		try {
			return await callback();
		} finally {
			getSocketCreationStub.restore();
		}
	}

	afterEach(() => {
		socket?.close();
	});

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

	it("Error of type connect_document_error should clear joinSession info from cache", async () => {
		// joinSession stub will be internally invoked by connectToDeltaStream below so mocking it here.
		const joinSessionStub = addJoinSessionStub();

		// Setup for mocking socket a error when connectToDeltaStream gets executed below
		const resolver = new OdspDriverUrlResolver();
		const odspResolvedUrl = await resolver.resolve({
			url: createOdspUrl({ driveId, itemId, siteUrl, dataStorePath: "/" }),
		});
		const service = await odspDocumentServiceFactory.createDocumentService(
			odspResolvedUrl,
			new MockLogger().toTelemetryLogger(),
		);
		const errorToThrow = createOdspNetworkError("TestError", 429);
		const errorFromEvent = "connect_document_error";
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: errorFromEvent, errorToThrow },
		});
		const client: IClient = {
			mode: "read",
			details: { capabilities: { interactive: true } },
			permission: [],
			user: { id: "id" },
			scopes: [],
		};

		// Save a mock joinSession response in nonPersistenCache to test with later.
		const cacheKey = getJoinSessionCacheKey(odspResolvedUrl);
		// eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		odspDocumentServiceFactory["nonPersistentCache"].sessionJoinCache.add(
			getJoinSessionCacheKey(odspResolvedUrl),
			async () => {
				return { entryTime: Date.now(), joinSessionResponse };
			},
		);

		try {
			await mockSocket(socket as unknown as Socket, async () =>
				service.connectToDeltaStream(client),
			);
		} catch (error) {
			assert(
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				(error as any).errorFrom === errorFromEvent,
				`errorFrom param with value as '${errorFromEvent}' should be available`,
			);

			const info =
				await odspDocumentServiceFactory.getRelayServiceSessionInfo(odspResolvedUrl);
			assert(
				info === undefined,
				`joinSession cache should get cleared when '${errorFromEvent}' occurs`,
			);
		} finally {
			// reset nonPersistenCache changes from the test
			// eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			odspDocumentServiceFactory["nonPersistentCache"].sessionJoinCache.remove(cacheKey);
			joinSessionStub.restore();
		}
	});

	it("Socket errors should not result in clearing of joinSession info from cache", async () => {
		// joinSession stub will be internally invoked by connectToDeltaStream below so mocking it here.
		const joinSessionStub = addJoinSessionStub();

		// Setup for mocking socket a error when connectToDeltaStream gets executed below
		const resolver = new OdspDriverUrlResolver();
		const odspResolvedUrl = await resolver.resolve({
			url: createOdspUrl({ driveId, itemId, siteUrl, dataStorePath: "/" }),
		});
		const service = await odspDocumentServiceFactory.createDocumentService(
			odspResolvedUrl,
			new MockLogger().toTelemetryLogger(),
		);
		const errorToThrow = createOdspNetworkError("TestSocketError", 401);
		const errorFromEvent = "connect_error";
		socket = new ClientSocketMock({
			connect_document: { eventToEmit: errorFromEvent, errorToThrow },
		});
		const client: IClient = {
			mode: "read",
			details: { capabilities: { interactive: true } },
			permission: [],
			user: { id: "id" },
			scopes: [],
		};

		// Save a mock joinSession response in nonPersistenCache to test with later.
		const cacheKey = getJoinSessionCacheKey(odspResolvedUrl);
		// eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		odspDocumentServiceFactory["nonPersistentCache"].sessionJoinCache.add(
			cacheKey,
			async () => {
				return { entryTime: Date.now(), joinSessionResponse };
			},
		);

		try {
			await mockSocket(socket as unknown as Socket, async () =>
				service.connectToDeltaStream(client),
			);
		} catch (error) {
			assert(
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				(error as any).errorFrom === errorFromEvent,
				`errorFrom param with value as ${errorFromEvent} should be present`,
			);

			const info =
				await odspDocumentServiceFactory.getRelayServiceSessionInfo(odspResolvedUrl);
			assert(
				info === joinSessionResponse,
				`joinSession cache should not get cleared when '${errorFromEvent}' occurs`,
			);
		} finally {
			// reset nonPersistenCache changes from the test
			// eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			odspDocumentServiceFactory["nonPersistentCache"].sessionJoinCache.remove(cacheKey);
			joinSessionStub.restore();
		}
	});
});
