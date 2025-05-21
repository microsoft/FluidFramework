/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import sinon from "sinon";
import { strict as assert } from "node:assert";
import { CollaborationSessionTracker } from "../sessionTracker";
import {
	ICollaborationSessionClient,
	ICollaborationSessionManager,
	IClientManager,
	ICollaborationSession,
} from "@fluidframework/server-services-core";

describe("CollaborationSessionTracker", () => {
	let clientManager: sinon.SinonStubbedInstance<IClientManager>;
	let sessionManager: sinon.SinonStubbedInstance<ICollaborationSessionManager>;
	let sessionTracker: CollaborationSessionTracker;

	beforeEach(() => {
		sinon.useFakeTimers();
		clientManager = {
			getClients: sinon.stub(),
		} as unknown as sinon.SinonStubbedInstance<IClientManager>;

		sessionManager = {
			getSession: sinon.stub(),
			addOrUpdateSession: sinon.stub(),
			removeSession: sinon.stub(),
			getAllSessions: sinon.stub(),
		} as unknown as sinon.SinonStubbedInstance<ICollaborationSessionManager>;

		sessionTracker = new CollaborationSessionTracker(clientManager, sessionManager);
	});

	afterEach(() => {
		sinon.restore();
	});

	describe("startClientSession", () => {
		it("should start a client session and update the session manager", async () => {
			const client: ICollaborationSessionClient = {
				clientId: "client1",
				joinedTime: Date.now(),
				isWriteClient: true,
				isSummarizerClient: false,
			};
			const sessionId = { tenantId: "tenant1", documentId: "doc1" };

			sessionManager.getSession.resolves(undefined);
			clientManager.getClients.resolves([]);

			await sessionTracker.startClientSession(client, sessionId);

			assert.equal(sessionManager.addOrUpdateSession.calledOnce, true);
			const updatedSession = sessionManager.addOrUpdateSession.getCall(0).args[0];
			assert.equal(updatedSession.tenantId, sessionId.tenantId);
			assert.equal(updatedSession.documentId, sessionId.documentId);
			assert.equal(updatedSession.firstClientJoinTime, client.joinedTime);
		});

		it("should handle errors and log them", async () => {
			const client: ICollaborationSessionClient = {
				clientId: "client1",
				joinedTime: Date.now(),
				isWriteClient: true,
				isSummarizerClient: false,
			};
			const sessionId = { tenantId: "tenant1", documentId: "doc1" };

			sessionManager.addOrUpdateSession.rejects(new Error("Test error"));
			clientManager.getClients.resolves([]);

			try {
				await sessionTracker.startClientSession(client, sessionId);
			} catch (error) {
				assert.equal((error as Error).message, "Test error");
			}
		});
	});

	describe("endClientSession", () => {
		it("should end a client session and start a session end timer", async () => {
			const client: ICollaborationSessionClient = {
				clientId: "client1",
				joinedTime: Date.now(),
				isWriteClient: true,
				isSummarizerClient: false,
			};
			const sessionId = { tenantId: "tenant1", documentId: "doc1" };

			sessionManager.getSession.resolves({
				tenantId: sessionId.tenantId,
				documentId: sessionId.documentId,
				firstClientJoinTime: Date.now(),
				latestClientJoinTime: Date.now(),
				lastClientLeaveTime: undefined,
				telemetryProperties: {
					hadWriteClient: true,
					totalClientsJoined: 1,
					maxConcurrentClients: 1,
				},
			});
			clientManager.getClients.resolves([]);

			await sessionTracker.endClientSession(client, sessionId);

			assert.equal(sessionManager.addOrUpdateSession.calledOnce, true);
			const updatedSession = sessionManager.addOrUpdateSession.getCall(0).args[0];
			assert.equal(typeof updatedSession.lastClientLeaveTime, "number");
		});

		it("should handle errors and log them", async () => {
			const client: ICollaborationSessionClient = {
				clientId: "client1",
				joinedTime: Date.now(),
				isWriteClient: true,
				isSummarizerClient: false,
			};
			const sessionId = { tenantId: "tenant1", documentId: "doc1" };

			sessionManager.getSession.resolves({
				tenantId: sessionId.tenantId,
				documentId: sessionId.documentId,
				firstClientJoinTime: Date.now(),
				latestClientJoinTime: Date.now(),
				lastClientLeaveTime: undefined,
				telemetryProperties: {
					hadWriteClient: true,
					totalClientsJoined: 1,
					maxConcurrentClients: 1,
				},
			});
			sessionManager.addOrUpdateSession.rejects(new Error("Test error"));
			clientManager.getClients.resolves([]);

			try {
				await sessionTracker.endClientSession(client, sessionId);
			} catch (error) {
				assert.equal((error as Error).message, "Test error");
			}
		});

		it("should handle session not found case", async () => {
			const client: ICollaborationSessionClient = {
				clientId: "client1",
				joinedTime: Date.now(),
				isWriteClient: true,
				isSummarizerClient: false,
			};
			const sessionId = { tenantId: "tenant1", documentId: "doc1" };

			sessionManager.getSession.resolves(undefined);
			clientManager.getClients.resolves([]);

			await sessionTracker.endClientSession(client, sessionId);

			assert.equal(sessionManager.addOrUpdateSession.notCalled, true);
		});

		it("should handle session updated on another instance", async () => {
			const client: ICollaborationSessionClient = {
				clientId: "client1",
				joinedTime: Date.now(),
				isWriteClient: true,
				isSummarizerClient: false,
			};
			const sessionId = { tenantId: "tenant1", documentId: "doc1" };

			const existingSession: ICollaborationSession = {
				tenantId: sessionId.tenantId,
				documentId: sessionId.documentId,
				firstClientJoinTime: Date.now() - 20 * 60 * 1000,
				latestClientJoinTime: Date.now() - 10 * 60 * 1000,
				lastClientLeaveTime: Date.now() - 15 * 60 * 1000,
				telemetryProperties: {
					hadWriteClient: true,
					totalClientsJoined: 1,
					maxConcurrentClients: 1,
				},
			};

			sessionManager.getSession.resolves(existingSession);
			clientManager.getClients.resolves([]);

			await sessionTracker.endClientSession(client, sessionId);
		});
	});

	describe("pruneInactiveSessions", () => {
		it("should prune inactive sessions", async () => {
			const session: ICollaborationSession = {
				tenantId: "tenant1",
				documentId: "doc1",
				firstClientJoinTime: Date.now() - 20 * 60 * 1000,
				latestClientJoinTime: Date.now() - 20 * 60 * 1000,
				lastClientLeaveTime: Date.now() - 15 * 60 * 1000,
				telemetryProperties: {
					hadWriteClient: true,
					totalClientsJoined: 1,
					maxConcurrentClients: 1,
				},
			};

			sessionManager.getAllSessions.resolves([session]);
			clientManager.getClients.resolves([]);

			await sessionTracker.pruneInactiveSessions();

			assert.equal(sessionManager.removeSession.calledOnce, true);
			const removedSession = sessionManager.removeSession.getCall(0).args[0];
			assert.equal(removedSession.tenantId, session.tenantId);
			assert.equal(removedSession.documentId, session.documentId);
		});

		it("should handle errors during pruning", async () => {
			sessionManager.getAllSessions.rejects(new Error("Test error"));
			clientManager.getClients.resolves([]);

			try {
				await sessionTracker.pruneInactiveSessions();
			} catch (error) {
				assert.equal((error as Error).message, "Test error");
			}
		});
	});
});
