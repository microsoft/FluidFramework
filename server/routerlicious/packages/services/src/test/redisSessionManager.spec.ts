/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { TestEngine1, Lumberjack } from "@fluidframework/server-services-telemetry";
import { TestRedisClientConnectionManager } from "@fluidframework/server-test-utils";
import { RedisCollaborationSessionManager } from "../redisSessionManager";
import { ICollaborationSession } from "@fluidframework/server-services-core";

const lumberjackEngine = new TestEngine1();
if (!Lumberjack.isSetupCompleted()) {
	Lumberjack.setup([lumberjackEngine]);
}

describe("RedisCollaborationSessionManager", () => {
	let testRedisClientConnectionManager: TestRedisClientConnectionManager;
	beforeEach(() => {
		testRedisClientConnectionManager = new TestRedisClientConnectionManager();
	});
	afterEach(() => {
		testRedisClientConnectionManager.getRedisClient().flushall();
		testRedisClientConnectionManager.getRedisClient().quit();
	});

	it("Creates and retrieves session", async () => {
		const sessionManager = new RedisCollaborationSessionManager(
			testRedisClientConnectionManager,
		);

		const session: ICollaborationSession = {
			documentId: "test-doc-id",
			tenantId: "test-tenant-id",
			firstClientJoinTime: Date.now(),
			lastClientLeaveTime: undefined,
			telemetryProperties: {
				hadWriteClient: true,
				totalClientsJoined: 2,
				maxConcurrentClients: 1,
			},
		};

		await sessionManager.addOrUpdateSession(session);
		const retrievedSession = await sessionManager.getSession({
			documentId: session.documentId,
			tenantId: session.tenantId,
		});
		assert.deepStrictEqual(retrievedSession, session);
	});

	it("Creates and overwrites session", async () => {
		const sessionManager = new RedisCollaborationSessionManager(
			testRedisClientConnectionManager,
		);

		const session: ICollaborationSession = {
			documentId: "test-doc-id",
			tenantId: "test-tenant-id",
			firstClientJoinTime: Date.now(),
			lastClientLeaveTime: undefined,
			telemetryProperties: {
				hadWriteClient: false,
				totalClientsJoined: 2,
				maxConcurrentClients: 1,
			},
		};

		await sessionManager.addOrUpdateSession(session);
		const updatedSession = {
			...session,
			telemetryProperties: {
				hadWriteClient: true,
				totalClientsJoined: 3,
				maxConcurrentClients: 2,
			},
		};
		await sessionManager.addOrUpdateSession(updatedSession);
		const retrievedSession = await sessionManager.getSession({
			documentId: session.documentId,
			tenantId: session.tenantId,
		});
		assert.deepStrictEqual(retrievedSession, updatedSession);
	});

	it("Returns undefined when session does not exist", async () => {
		const sessionManager = new RedisCollaborationSessionManager(
			testRedisClientConnectionManager,
		);

		const session = await sessionManager.getSession({
			documentId: "test-doc-id",
			tenantId: "test-tenant-id",
		});
		assert.strictEqual(session, undefined);
	});

	it("Gets all sessions", async () => {
		const sessionManager = new RedisCollaborationSessionManager(
			testRedisClientConnectionManager,
		);
		const session1: ICollaborationSession = {
			documentId: "test-doc-id-1",
			tenantId: "test-tenant-id",
			firstClientJoinTime: Date.now(),
			lastClientLeaveTime: undefined,
			telemetryProperties: {
				hadWriteClient: true,
				totalClientsJoined: 10,
				maxConcurrentClients: 5,
			},
		};
		const session2: ICollaborationSession = {
			documentId: "test-doc-id-2",
			tenantId: "test-tenant-id",
			firstClientJoinTime: Date.now(),
			lastClientLeaveTime: undefined,
			telemetryProperties: {
				hadWriteClient: false,
				totalClientsJoined: 2,
				maxConcurrentClients: 1,
			},
		};
		await sessionManager.addOrUpdateSession(session1);
		await sessionManager.addOrUpdateSession(session2);

		const retrievedSessions = await sessionManager.getAllSessions();
		assert.strictEqual(retrievedSessions.length, 2);
		for (const session of [session1, session2]) {
			const retrievedSession = retrievedSessions.find(
				(s) => s.documentId === session.documentId,
			);
			assert(retrievedSession, `Session for ${session1} not found`);
			assert.deepStrictEqual(retrievedSession, session);
		}
	});

	it("Gets all sessions when there are more sessions than batch size", async () => {
		// Set maxScanBatchSize to 2 to test multiple scan batches
		const sessionScanBatchSize = 10;
		const sessionsToCreate = 20;
		const sessionManager = new RedisCollaborationSessionManager(
			testRedisClientConnectionManager,
			undefined,
			{ maxScanBatchSize: sessionScanBatchSize },
		);

		const sessions: ICollaborationSession[] = [];
		const writeSessionPs: Promise<void>[] = [];
		// Create sessions with enough variety to verify that all sessions are retrieved correctly
		for (let i = 0; i < sessionsToCreate; i++) {
			const session: ICollaborationSession = {
				documentId: `test-doc-id-${i}`,
				tenantId: `test-tenant-id-${i % 3}`,
				firstClientJoinTime: Date.now() - 100 * i,
				lastClientLeaveTime: i % 4 === 0 ? Date.now() : undefined,
				telemetryProperties: {
					hadWriteClient: i % 2 === 0,
					totalClientsJoined: 2,
					maxConcurrentClients: 1,
				},
			};
			sessions.push(session);
			writeSessionPs.push(sessionManager.addOrUpdateSession(session));
		}
		await Promise.all(writeSessionPs);

		const retrievedSessions = await sessionManager.getAllSessions();
		assert.strictEqual(retrievedSessions.length, sessions.length);
		for (const session of sessions) {
			const retrievedSession = retrievedSessions.find(
				(s) => s.documentId === session.documentId,
			);
			assert(retrievedSession, "Session not found");
			assert.deepStrictEqual(retrievedSession, session);
		}
	});
});
