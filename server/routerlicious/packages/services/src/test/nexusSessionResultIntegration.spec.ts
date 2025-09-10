/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stub, SinonStub } from "sinon";
import type { ISignalClient } from "@fluidframework/protocol-definitions";
import {
	IClientManager,
	ICollaborationSession,
	ICollaborationSessionManager,
	ICollaborationSessionClient,
} from "@fluidframework/server-services-core";
import { CommonProperties, LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";
import { CollaborationSessionTracker } from "../sessionTracker";

describe("Routerlicious", () => {
	describe("Services", () => {
		describe("NexusSessionResult Integration", () => {
			let mockClientManager: IClientManager;
			let mockSessionManager: ICollaborationSessionManager;
			let sessionTracker: CollaborationSessionTracker;
			let lumberjackStub: SinonStub;

			beforeEach(() => {
				mockClientManager = {
					getClients: stub().resolves([]),
				} as any;
				
				mockSessionManager = {
					getSession: stub(),
					addOrUpdateSession: stub().resolves(),
					removeSession: stub().resolves(),
				} as any;

				// Mock Lumberjack.newLumberMetric
				lumberjackStub = stub(Lumberjack, 'newLumberMetric').returns({
					setProperties: stub(),
					overrideTimestamp: stub(),
					success: stub(),
				} as any);

				sessionTracker = new CollaborationSessionTracker(
					mockClientManager,
					mockSessionManager,
					10 // very short timeout for testing
				);
			});

			afterEach(() => {
				lumberjackStub.restore();
			});

			it("should include session-level op and signal counts in NexusSessionResult telemetry", async () => {
				const sessionId = { tenantId: "tenant1", documentId: "doc1" };
				const now = Date.now();
				
				// Setup session with accumulated metrics
				const sessionWithMetrics: ICollaborationSession = {
					tenantId: sessionId.tenantId,
					documentId: sessionId.documentId,
					firstClientJoinTime: now - 1000,
					latestClientJoinTime: now - 500,
					lastClientLeaveTime: now - 100, // Last client left 100ms ago
					telemetryProperties: {
						hadWriteClient: true,
						totalClientsJoined: 3,
						maxConcurrentClients: 2,
						sessionOpCount: 42, // Total ops from all clients
						sessionSignalCount: 15, // Total signals from all clients
					},
				};

				(mockSessionManager.getSession as any).resolves(sessionWithMetrics);

				// Start a client session and immediately end it to trigger timeout
				const client: ICollaborationSessionClient = {
					clientId: "client1",
					joinedTime: now,
					isWriteClient: true,
					isSummarizerClient: false,
				};

				await sessionTracker.startClientSession(client, sessionId);
				
				// End the client session with additional metrics
				await sessionTracker.endClientSession(
					client,
					sessionId,
					[], // no other clients
					{
						opCount: 8, // This client's contribution
						signalCount: 2, // This client's contribution
					}
				);

				// Wait for timeout to trigger (using setTimeout, so we need to wait)
				await new Promise(resolve => setTimeout(resolve, 20));

				// Verify NexusSessionResult metric was created
				assert.ok(lumberjackStub.called, "Lumberjack.newLumberMetric should have been called");
				
				const metricCall = lumberjackStub.getCall(0);
				assert.equal(metricCall.args[0], LumberEventName.NexusSessionResult, "Should create NexusSessionResult metric");
				
				// Verify the telemetry properties include session-level counts
				const telemetryProps = metricCall.args[1];
				assert.equal(telemetryProps[CommonProperties.sessionOpCount], 50, "Should include total session op count (42 + 8)");
				assert.equal(telemetryProps[CommonProperties.sessionSignalCount], 17, "Should include total session signal count (15 + 2)");
				
				// Verify other expected properties are present
				assert.equal(telemetryProps.documentId, sessionId.documentId);
				assert.equal(telemetryProps.tenantId, sessionId.tenantId);
				assert.ok(telemetryProps.durationInMs > 0, "Should include session duration");
			});
		});
	});
});