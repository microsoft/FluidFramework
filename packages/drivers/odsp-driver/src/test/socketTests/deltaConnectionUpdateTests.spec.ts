/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IClient } from "@fluidframework/driver-definitions";
import type { ISignalMessage } from "@fluidframework/driver-definitions/internal";
import type {
	ISensitivityLabel,
	ISocketStorageDiscovery,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	type ITelemetryLoggerExt,
	MockLogger,
} from "@fluidframework/telemetry-utils/internal";
import { type SinonFakeTimers, type SinonStub, stub, useFakeTimers } from "sinon";
import type { Socket } from "socket.io-client";

import type { OdspFluidDataStoreLocator } from "../../contractsPublic.js";
import { createOdspUrl } from "../../createOdspUrl.js";
import { EpochTracker } from "../../epochTracker.js";
import { mockify } from "../../mockify.js";
import { LocalPersistentCache } from "../../odspCache.js";
import type { OdspDocumentDeltaConnection } from "../../odspDocumentDeltaConnection.js";
import type { OdspDocumentService } from "../../odspDocumentService.js";
import { OdspDocumentServiceFactory } from "../../odspDocumentServiceFactory.js";
import { OdspDriverUrlResolver } from "../../odspDriverUrlResolver.js";
import { getHashedDocumentId } from "../../odspPublicUtils.js";
import { SocketIOClientStatic } from "../../socketModule.js";
import { fetchJoinSession } from "../../vroom.js";

import { ClientSocketMock } from "./socketMock.js";

describe("DeltaConnectionMetadata update tests", () => {
	let clock: SinonFakeTimers;
	const client: IClient = {
		mode: "write",
		scopes: ["doc:read", "doc:write"],
		details: { capabilities: { interactive: true } },
		permission: [],
		user: { id: "userId" },
	};

	let logger: ITelemetryLoggerExt;
	const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
	const driveId = "driveId";
	const itemId = "itemId";
	let epochTracker: EpochTracker;
	let localCache: LocalPersistentCache;
	let hashedDocumentId: string;
	let service: OdspDocumentService;
	let socket: ClientSocketMock | undefined;
	const resolver = new OdspDriverUrlResolver();
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

	function addJoinSessionStub(label: ISensitivityLabel): SinonStub {
		joinSessionResponse.sensitivityLabelsInfo = {
			timestamp: new Date().toISOString(),
			labels: [label],
		};
		const joinSessionStub = stub(fetchJoinSession, mockify.key).callsFake(
			async () => joinSessionResponse,
		);
		return joinSessionStub;
	}

	function testSensitivityLabelObjectWithId(id: string): ISensitivityLabel {
		return {
			sensitivityLabelId: id,
			tenantId: "tenantId",
			assignmentMethod: "standard",
			appliedByUserEmail: "fakeemail@microsoft.com",
		};
	}

	before(async () => {
		hashedDocumentId = await getHashedDocumentId(driveId, itemId);
	});

	beforeEach(async () => {
		clock = useFakeTimers();
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
		logger = new MockLogger().toTelemetryLogger();
		epochTracker = new EpochTracker(
			localCache,
			{
				docId: hashedDocumentId,
				resolvedUrl,
			},
			logger,
		);

		service = (await odspDocumentServiceFactory.createDocumentService(
			resolvedUrl,
			logger,
		)) as OdspDocumentService;
	});

	async function mockSocket<T>(_response: Socket, callback: () => Promise<T>): Promise<T> {
		const getSocketCreationStub = stub(SocketIOClientStatic, mockify.key);
		getSocketCreationStub.returns(_response);
		try {
			return await callback();
		} finally {
			getSocketCreationStub.restore();
		}
	}

	it("Join session response parsing", async () => {
		await tickClock(1);
		socket = new ClientSocketMock();
		let eventRaised = false;

		const exampleSensitivityLabelsInfo = `{
			"timestamp":"2025-05-28T14:56:21-07:00",
			"labels":[
				{"sensitivityLabelId":"sensitivityLabelId",
				"tenantId":"tenantId",
				"assignmentMethod":"standard",
				"appliedByUserEmail":"fakeemail@microsoft.com"}
			]}`;

		const joinSessionResponseString = `
			{
				"@odata.context":"https://microsoft.sharepoint-df.com/_api/v2.1/$metadata#oneDrive.session",
				"deltaStorageUrl":"https://fake/deltaStorageUrl",
				"deltaStreamSocketUrl":"https://localhost:3001",
				"id":"id",
				"refreshSessionDurationSeconds":100,
				"runtimeTenantId":"1!1!3",
				"snapshotStorageUrl":"https://fake/snapshotStorageUrl",
				"socketToken":"",
				"sensitivityLabelsInfo": ${exampleSensitivityLabelsInfo}
			}`;

		const parsedResponse = JSON.parse(joinSessionResponseString) as ISocketStorageDiscovery;

		const handler = (metadata: Record<string, string>): void => {
			eventRaised = true;
			assert.deepStrictEqual(
				JSON.parse(metadata.sensitivityLabelsInfo),
				parsedResponse.sensitivityLabelsInfo,
				"sensitivity info via event should match",
			);
		};

		const joinSessionStub = stub(fetchJoinSession, mockify.key).callsFake(
			async () => parsedResponse,
		);

		service.on("metadataUpdate", handler);
		const connection = (await mockSocket(socket as unknown as Socket, async () =>
			service.connectToDeltaStream(client),
		)) as OdspDocumentDeltaConnection;
		assert(eventRaised, "event1 should have been raised");
		service.off("metadataUpdate", handler);
		joinSessionStub.restore();

		assert(!connection.disposed, "connection should not be disposed");

		assert(joinSessionStub.calledOnce, "Should called once on first try");
	});

	it("Delta connection metadata should be updated via Fluid signals and join session response", async () => {
		await tickClock(1);
		socket = new ClientSocketMock();
		let eventRaised = false;
		let content: Record<string, ISensitivityLabel[]>;

		const handler = (metadata: Record<string, string>): void => {
			eventRaised = true;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			const arg1 = JSON.parse(metadata.sensitivityLabelsInfo).labels;
			const arg2: ISensitivityLabel[] | undefined = content.labels;
			assert.deepStrictEqual(arg1, arg2, "label via event should match");
		};

		const label1Object = testSensitivityLabelObjectWithId("label1");
		let joinSessionStub = addJoinSessionStub(label1Object);

		content = { labels: [label1Object] };
		service.on("metadataUpdate", handler);
		const connection = (await mockSocket(socket as unknown as Socket, async () =>
			service.connectToDeltaStream(client),
		)) as OdspDocumentDeltaConnection;
		assert(eventRaised, "event1 should have been raised");
		service.off("metadataUpdate", handler);
		joinSessionStub.restore();

		assert(!connection.disposed, "connection should not be disposed");

		assert(joinSessionStub.calledOnce, "Should called once on first try");

		await tickClock(1);

		// Now change label through signal and listen as event on service.
		// eslint-disable-next-line require-atomic-updates
		eventRaised = false;
		const label2Object = testSensitivityLabelObjectWithId("label2");
		content = { labels: [label2Object] };
		const signalContent1 = { labels: [label2Object], timestamp: new Date().toISOString() };
		const signalMessage1: ISignalMessage = {
			clientId: null,
			content: JSON.stringify({
				contents: {
					type: "PolicyLabelsUpdate",
					content: signalContent1,
				},
			}),
		};

		service.on("metadataUpdate", handler);

		socket.emit("signal", signalMessage1, joinSessionResponse.id);
		assert(eventRaised, "event2 should have been raised");
		service.off("metadataUpdate", handler);

		await tickClock(1);

		// Now update through join session response
		// eslint-disable-next-line require-atomic-updates
		eventRaised = false;
		const label3Object = testSensitivityLabelObjectWithId("label3");
		content = { labels: [label3Object] };
		service.on("metadataUpdate", handler);
		joinSessionStub = addJoinSessionStub(label3Object);
		await tickClock(70000);
		joinSessionStub.restore();
		assert(eventRaised, "event3 should have been raised");
		service.off("metadataUpdate", handler);
	});

	afterEach(async () => {
		clock.reset();
		socket?.close();
		await epochTracker.removeEntries().catch(() => {});
	});

	afterEach(async () => {
		clock.restore();
	});
});
