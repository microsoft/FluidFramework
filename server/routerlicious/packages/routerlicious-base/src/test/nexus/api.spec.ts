/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ScopeType } from "@fluidframework/protocol-definitions";
// import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { MongoDatabaseManager, MongoManager } from "@fluidframework/server-services-core";
import { StartupCheck } from "@fluidframework/server-services-shared";
import { Lumberjack, TestEngine1 } from "@fluidframework/server-services-telemetry";
import { generateToken } from "@fluidframework/server-services-utils";
import {
	TestDbFactory,
	TestDocumentStorage,
	TestTenantManager,
	TestThrottler,
} from "@fluidframework/server-test-utils";
import assert from "assert";
import express from "express";
import nconf from "nconf";
import Sinon from "sinon";
import request from "supertest";
import * as nexusApp from "../../nexus/app";
import { Constants } from "../../utils";
import { PubSub } from "@fluidframework/server-memory-orderer";
import { LocalWebSocketServer } from "@fluidframework/server-local-server";

const nodeCollectionName = "testNodes";
const documentsCollectionName = "testDocuments";
const checkpointsCollectionName = "testCheckpoints";
const deltasCollectionName = "testDeltas";
const rawDeltasCollectionName = "testRawDeltas";
const defaultProvider = new nconf.Provider({}).defaults({
	nexus: {
		notificationsApi: {
			enabled: true,
		},
	},
	auth: {
		maxTokenLifetimeSec: 1000000,
		enableTokenExpiration: true,
	},
	logger: {
		morganFormat: "json",
	},
	worker: {
		blobStorageUrl: "http://localhost:3001",
		deltaStreamUrl: "http://localhost:3005",
		serverUrl: "http://localhost:3003",
	},
});
const pubsub = new PubSub();
const webSocketServer = new LocalWebSocketServer(pubsub);

if (!Lumberjack.isSetupCompleted()) {
	Lumberjack.setup([new TestEngine1()]);
}

describe("Routerlicious", () => {
	describe("Nexus", () => {
		describe("API", async () => {
			const appTenant1: IAlfredTenant = {
				id: "default-tenant-1",
				key: "tenant-key-1",
			};
			const defaultTenantManager = new TestTenantManager();
			const document1 = {
				_id: "doc-1",
				tenantId: appTenant1.id,
				documentId: "doc-1",
				content: "Hello, World!",
				session: {
					ordererUrl: defaultProvider.get("worker:serverUrl"),
					deltaStreamUrl: defaultProvider.get("worker:deltaStreamUrl"),
					historianUrl: defaultProvider.get("worker:blobStorageUrl"),
					isSessionAlive: true,
					isSessionActive: true,
				},
			};
			const defaultDbFactory = new TestDbFactory({
				[documentsCollectionName]: [document1],
				[deltasCollectionName]: [],
				[rawDeltasCollectionName]: [],
			});
			const defaultMongoManager = new MongoManager(defaultDbFactory);
			const globalDbEnabled = false;
			const defaultDbManager = new MongoDatabaseManager(
				globalDbEnabled,
				defaultMongoManager,
				defaultMongoManager,
				nodeCollectionName,
				documentsCollectionName,
				checkpointsCollectionName,
				deltasCollectionName,
				rawDeltasCollectionName,
			);
			const defaultStorage = new TestDocumentStorage(defaultDbManager, defaultTenantManager);
			const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
			const tenantToken1 = `Basic ${generateToken(
				appTenant1.id,
				document1._id,
				appTenant1.key,
				scopes,
			)}`;
			const defaultStartupCheck = new StartupCheck();
			// const defaultCollaborationSessionEventEmitter =
			// 	new TypedEventEmitter<ICollaborationSessionEvents>();
			let app: express.Express;
			let supertest: request.SuperTest<request.Test>;
			describe("throttling", () => {
				const limitTenant = 10;
				beforeEach(() => {
					const restTenantThrottler = new TestThrottler(limitTenant);
					const restTenantThrottlers = new Map<string, TestThrottler>();
					restTenantThrottlers.set(
						Constants.generalRestCallThrottleIdPrefix,
						restTenantThrottler,
					);
					app = nexusApp.create(defaultProvider, defaultStartupCheck, undefined);
					nexusApp.bindNexusRoutes(
						app,
						defaultProvider,
						defaultTenantManager,
						restTenantThrottlers,
						defaultStorage,
						webSocketServer,
					);
					supertest = request(app);
				});

				const assertThrottle = async (
					url: string,
					token: string | (() => string) | undefined,
					body: any | undefined,
					method: "get" | "post" | "patch" = "get",
					limit: number = limitTenant,
				): Promise<void> => {
					const tokenProvider =
						typeof token === "function" ? token : () => token ?? "no-token";
					for (let i = 0; i < limit; i++) {
						// we're not interested in making the requests succeed with 200s, so just assert that not 429
						await supertest[method](url)
							.set("Authorization", tokenProvider())
							.send(body)
							.expect((res) => {
								assert.notStrictEqual(res.status, 429);
							});
					}
					await supertest[method](url)
						.set("Authorization", tokenProvider())
						.send(body)
						.expect(429);
				};

				describe("/api/v1", () => {
					it("/api/v1/:tenantId/:id/broadcast-signal", async () => {
						await assertThrottle(
							`/api/v1/${appTenant1.id}/${document1._id}/broadcast-signal`,
							"Bearer 12345", // Dummy bearer token
							undefined,
							"post",
						);
					});
				});
			});

			describe("authorization", () => {
				const maxThrottlerLimit = 10;
				beforeEach(() => {
					const restTenantThrottler = new TestThrottler(maxThrottlerLimit);
					const restTenantThrottlers = new Map<string, TestThrottler>();
					restTenantThrottlers.set(
						Constants.generalRestCallThrottleIdPrefix,
						restTenantThrottler,
					);

					app = nexusApp.create(defaultProvider, defaultStartupCheck, undefined);
					nexusApp.bindNexusRoutes(
						app,
						defaultProvider,
						defaultTenantManager,
						restTenantThrottlers,
						defaultStorage,
						webSocketServer,
					);
					supertest = request(app);
				});

				describe("/api/v1", () => {
					it("/api/v1/:tenantId/:id/broadcast-signal", async () => {
						const body = {
							signalContent: {
								contents: {
									type: "ExternalDataChanged_V1.0.0",
									content: { taskListId: "task-list-1" },
								},
							},
						};

						await supertest
							.post(`/api/v1/${appTenant1.id}/${document1._id}/broadcast-signal`)
							.send(body)
							.set("Authorization", tenantToken1)
							.set("Content-Type", "application/json")
							.expect(200);
					});
					it("/api/v1/:tenantId/:id/broadcast-signal invalid-token", async () => {
						const body = {
							signalContent: {
								contents: {
									type: "ExternalDataChanged_V1.0.0",
									content: { taskListId: "task-list-1" },
								},
							},
						};

						await supertest
							.post(`/api/v1/${appTenant1.id}/${document1._id}/broadcast-signal`)
							.send(body)
							.set("Content-Type", "application/json")
							.expect(403);
					});
				});
			});

			describe("CorrelationId", () => {
				const correlationIdHeaderName = "x-correlation-id";
				const testCorrelationId = "test-correlation-id";

				const maxThrottlerLimit = 1000000;
				beforeEach(() => {
					const restTenantThrottler = new TestThrottler(maxThrottlerLimit);
					const restTenantThrottlers = new Map<string, TestThrottler>();
					restTenantThrottlers.set(
						Constants.generalRestCallThrottleIdPrefix,
						restTenantThrottler,
					);

					app = nexusApp.create(defaultProvider, defaultStartupCheck, undefined);
					nexusApp.bindNexusRoutes(
						app,
						defaultProvider,
						defaultTenantManager,
						restTenantThrottlers,
						defaultStorage,
						webSocketServer,
					);
					supertest = request(app);
				});

				const assertCorrelationId = async (
					url: string,
					method: "get" | "post" | "put" | "patch" | "delete" = "get",
				): Promise<void> => {
					await supertest[method](url)
						.set(correlationIdHeaderName, testCorrelationId)
						.then((res) => {
							assert.strictEqual(
								res.header?.[correlationIdHeaderName],
								testCorrelationId,
							);
						});
				};

				describe("/api/v1", () => {
					it("/api/v1/:tenantId/:id/broadcast-signal", async () => {
						await assertCorrelationId(
							`/api/v1/${appTenant1.id}/${document1._id}/broadcast-signal`,
							"post",
						);
					});
				});
			});

			describe("functionality", () => {
				const maxThrottlerLimit = 10;
				const restTenantThrottler = new TestThrottler(maxThrottlerLimit);
				const restTenantThrottlers = new Map<string, TestThrottler>();
				restTenantThrottlers.set(
					Constants.generalRestCallThrottleIdPrefix,
					restTenantThrottler,
				);
				beforeEach(() => {
					app = nexusApp.create(defaultProvider, defaultStartupCheck, undefined);
					nexusApp.bindNexusRoutes(
						app,
						defaultProvider,
						defaultTenantManager,
						restTenantThrottlers,
						defaultStorage,
						webSocketServer,
					);
					supertest = request(app);
				});

				afterEach(() => {
					Sinon.restore();
				});

				describe("/api/v1/:tenantId/:id/broadcast-signal", () => {
					it("Successful request", async () => {
						const body = {
							signalContent: {
								contents: {
									type: "ExternalDataChanged_V1.0.0",
									content: { taskListId: "task-list-1" },
								},
							},
						};

						await supertest
							.post(`/api/v1/${appTenant1.id}/${document1._id}/broadcast-signal`)
							.send(body)
							.set("Authorization", tenantToken1)
							.set("Content-Type", "application/json")
							.expect(200);
					});

					it("Invalid request content", async () => {
						const body = {
							signalContent: {},
						};

						await supertest
							.post(`/api/v1/${appTenant1.id}/${document1._id}/broadcast-signal`)
							.send(body)
							.set("Authorization", tenantToken1)
							.set("Content-Type", "application/json")
							.expect(400);
					});

					it("Successful request with redirect", async () => {
						const body = {
							signalContent: {
								contents: {
									type: "ExternalDataChanged_V1.0.0",
									content: { taskListId: "task-list-1" },
								},
							},
						};
						const documentHostedInOtherUrl = {
							_id: "doc-1",
							tenantId: appTenant1.id,
							version: "1.0",
							documentId: "doc-1",
							content: "Hello, World!",
							session: {
								ordererUrl: defaultProvider.get("worker:serverUrl"),
								deltaStreamUrl: "http://localhost:3006",
								historianUrl: defaultProvider.get("worker:blobStorageUrl"),
								isSessionAlive: true,
								isSessionActive: true,
							},
							createTime: Date.now(),
							scribe: "",
							deli: "",
						};

						Sinon.stub(defaultStorage, "getDocument").returns(
							Promise.resolve(documentHostedInOtherUrl),
						);

						await supertest
							.post(
								`/api/v1/${appTenant1.id}/${documentHostedInOtherUrl._id}/broadcast-signal`,
							)
							.send(body)
							.set("Authorization", tenantToken1)
							.set("Content-Type", "application/json")
							.expect(302);
					});

					it("Document not found", async () => {
						const body = {
							signalContent: {
								contents: {
									type: "ExternalDataChanged_V1.0.0",
									content: { taskListId: "task-list-1" },
								},
							},
						};

						const documentNoActiveSession = {
							_id: "doc-1",
							tenantId: appTenant1.id,
							version: "1.0",
							documentId: "doc-1",
							content: "Hello, World!",
							session: {
								ordererUrl: defaultProvider.get("worker:serverUrl"),
								deltaStreamUrl: "http://localhost:3006",
								historianUrl: defaultProvider.get("worker:blobStorageUrl"),
								isSessionAlive: false,
								isSessionActive: false,
							},
							createTime: Date.now(),
							scribe: "",
							deli: "",
						};

						Sinon.stub(defaultStorage, "getDocument")
							.onFirstCall()
							.returns(Promise.resolve(null))
							.onSecondCall()
							.returns(Promise.resolve(documentNoActiveSession));

						await supertest
							.post(
								`/api/v1/${appTenant1.id}/${documentNoActiveSession._id}/broadcast-signal`,
							)
							.send(body)
							.set("Authorization", tenantToken1)
							.set("Content-Type", "application/json")
							.expect(404);

						await supertest
							.post(
								`/api/v1/${appTenant1.id}/${documentNoActiveSession._id}/broadcast-signal`,
							)
							.send(body)
							.set("Authorization", tenantToken1)
							.set("Content-Type", "application/json")
							.expect(404);
					});

					it("Document session not alive", async () => {
						const body = {
							signalContent: {
								contents: {
									type: "ExternalDataChanged_V1.0.0",
									content: { taskListId: "task-list-1" },
								},
							},
						};
						const documentNoSessionAlive = {
							_id: "doc-1",
							tenantId: appTenant1.id,
							version: "1.0",
							documentId: "doc-1",
							content: "Hello, World!",
							session: {
								ordererUrl: defaultProvider.get("worker:serverUrl"),
								deltaStreamUrl: "http://localhost:3006",
								historianUrl: defaultProvider.get("worker:blobStorageUrl"),
								isSessionAlive: false,
								isSessionActive: true,
							},
							createTime: Date.now(),
							scribe: "",
							deli: "",
						};

						Sinon.stub(defaultStorage, "getDocument").returns(
							Promise.resolve(documentNoSessionAlive),
						);

						await supertest
							.post(
								`/api/v1/${appTenant1.id}/${documentNoSessionAlive._id}/broadcast-signal`,
							)
							.send(body)
							.set("Authorization", tenantToken1)
							.set("Content-Type", "application/json")
							.expect(410);
					});

					// it("Missing event emitter", async () => {
					// 	const appWithoutEmitter = nexusApp.create(
					// 		defaultProvider,
					// 		defaultStartupCheck,
					// 		undefined,
					// 	);
					// 	nexusApp.bindNexusRoutes(appWithoutEmitter, defaultProvider, defaultTenantManager, restTenantThrottlers, defaultStorage, webSocketServer);
					// 	supertest = request(appWithoutEmitter);

					// 	const body = {
					// 		signalContent: {
					// 			contents: {
					// 				type: "ExternalDataChanged_V1.0.0",
					// 				content: { taskListId: "task-list-1" },
					// 			},
					// 		},
					// 	};

					// 	await supertest
					// 		.post(`/api/v1/${appTenant1.id}/${document1._id}/broadcast-signal`)
					// 		.send(body)
					// 		.set("Authorization", tenantToken1)
					// 		.set("Content-Type", "application/json")
					// 		.expect(500);
					// });
				});
			});
		});
	});
});
