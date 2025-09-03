/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stub } from "sinon";
import type { ISignalClient } from "@fluidframework/protocol-definitions";
import {
	IClientManager,
	ICollaborationSession,
	ICollaborationSessionManager,
	ICollaborationSessionClient,
} from "@fluidframework/server-services-core";
import { CommonProperties } from "@fluidframework/server-services-telemetry";
import { CollaborationSessionTracker } from "../sessionTracker";

describe("Routerlicious", () => {
	describe("Services", () => {
		describe("SessionTracker Metrics", () => {
			let mockClientManager: IClientManager;
			let mockSessionManager: ICollaborationSessionManager;
			let sessionTracker: CollaborationSessionTracker;

			beforeEach(() => {
				mockClientManager = {
					getClients: stub().resolves([]),
				} as any;
				
				mockSessionManager = {
					getSession: stub(),
					addOrUpdateSession: stub().resolves(),
					removeSession: stub().resolves(),
				} as any;

				sessionTracker = new CollaborationSessionTracker(
					mockClientManager,
					mockSessionManager,
					100 // short timeout for testing
				);
			});

			it("should accumulate client op and signal counts in session telemetry properties", async () => {
				const sessionId = { tenantId: "tenant1", documentId: "doc1" };
				const client: ICollaborationSessionClient = {
					clientId: "client1",
					joinedTime: Date.now(),
					isWriteClient: true,
					isSummarizerClient: false,
				};

				// Setup initial session
				const initialSession: ICollaborationSession = {
					tenantId: sessionId.tenantId,
					documentId: sessionId.documentId,
					firstClientJoinTime: client.joinedTime,
					latestClientJoinTime: client.joinedTime,
					lastClientLeaveTime: undefined,
					telemetryProperties: {
						hadWriteClient: true,
						totalClientsJoined: 1,
						maxConcurrentClients: 1,
					},
				};

				(mockSessionManager.getSession as any).resolves(initialSession);

				// End client session with metrics
				await sessionTracker.endClientSession(
					client,
					sessionId,
					[], // no other connected clients
					{
						opCount: 25,
						signalCount: 8,
					}
				);

				// Verify that addOrUpdateSession was called with accumulated counts
				const updateCall = (mockSessionManager.addOrUpdateSession as any).getCall(0);
				assert.ok(updateCall, "addOrUpdateSession should have been called");
				
				const updatedSession = updateCall.args[0];
				assert.equal(updatedSession.telemetryProperties.sessionOpCount, 25);
				assert.equal(updatedSession.telemetryProperties.sessionSignalCount, 8);
			});

			it("should accumulate counts from multiple clients", async () => {
				const sessionId = { tenantId: "tenant1", documentId: "doc1" };
				
				// Setup session with existing counts from previous clients
				const existingSession: ICollaborationSession = {
					tenantId: sessionId.tenantId,
					documentId: sessionId.documentId,
					firstClientJoinTime: Date.now(),
					latestClientJoinTime: Date.now(),
					lastClientLeaveTime: undefined,
					telemetryProperties: {
						hadWriteClient: true,
						totalClientsJoined: 2,
						maxConcurrentClients: 2,
						sessionOpCount: 10, // existing count from previous client
						sessionSignalCount: 5, // existing count from previous client
					},
				};

				(mockSessionManager.getSession as any).resolves(existingSession);

				const client: ICollaborationSessionClient = {
					clientId: "client2",
					joinedTime: Date.now(),
					isWriteClient: true,
					isSummarizerClient: false,
				};

				// End client session with additional metrics
				await sessionTracker.endClientSession(
					client,
					sessionId,
					[], // no other connected clients
					{
						opCount: 15,
						signalCount: 3,
					}
				);

				// Verify that counts were accumulated
				const updateCall = (mockSessionManager.addOrUpdateSession as any).getCall(0);
				const updatedSession = updateCall.args[0];
				assert.equal(updatedSession.telemetryProperties.sessionOpCount, 25); // 10 + 15
				assert.equal(updatedSession.telemetryProperties.sessionSignalCount, 8); // 5 + 3
			});
		});
	});
});