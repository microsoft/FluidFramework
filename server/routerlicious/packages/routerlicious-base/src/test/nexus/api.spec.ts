/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import {
	// IDocument,
	MongoDatabaseManager,
	MongoManager,
} from "@fluidframework/server-services-core";
import { StartupCheck } from "@fluidframework/server-services-shared";
import { Lumberjack, TestEngine1 } from "@fluidframework/server-services-telemetry";
import { generateToken } from "@fluidframework/server-services-utils";
import {
	// TestCache,
	// TestClusterDrainingStatusChecker,
	TestDbFactory,
	TestDocumentStorage,
	// TestFluidAccessTokenGenerator,
	// TestKafka,
	// TestNotImplementedDocumentRepository,
	// TestProducer,
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
// import * as SessionHelper from "../../utils/sessionHelper";

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
			// const appTenant2: IAlfredTenant = {
			// 	id: "default-tenant-2",
			// 	key: "tenant-key-2",
			// };
			// const defaultAppTenants: IAlfredTenant[] = [appTenant1, appTenant2];
			const defaultTenantManager = new TestTenantManager();
			const document1 = {
				_id: "doc-1",
				tenantId: appTenant1.id,
				documentId: "doc-1",
				content: "Hello, World!",
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
			// const defaultSingleUseTokenCache = new TestCache();
			const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
			const tenantToken1 = `Basic ${generateToken(
				appTenant1.id,
				document1._id,
				appTenant1.key,
				scopes,
			)}`;
			// const tenantToken2 = `Basic ${generateToken(
			// 	appTenant2.id,
			// 	document1._id,
			// 	appTenant2.key,
			// 	scopes,
			// )}`;
			// const tenantToken3 = `Basic ${generateToken(
			// 	appTenant1.id,
			// 	document1._id,
			// 	appTenant1.key,
			// 	scopes,
			// )}`;
			// const tenantToken4 = `Basic ${generateToken(
			// 	appTenant1.id,
			// 	document1._id,
			// 	appTenant1.key,
			// 	scopes,
			// )}`;
			// const defaultProducer = new TestProducer(new TestKafka());
			// const deltasCollection = await defaultDbManager.getDeltaCollection(
			// 	undefined,
			// 	undefined,
			// );
			// const defaultDocumentRepository = new TestNotImplementedDocumentRepository();
			// const defaultCollaborationSessionEventEmitter =
			// 	new TypedEventEmitter<ICollaborationSessionEvents>();
			let app: express.Application;
			let supertest: request.SuperTest<request.Test>;
			// let testFluidAccessTokenGenerator: TestFluidAccessTokenGenerator;
			// let testClusterDrainingStatusChecker: TestClusterDrainingStatusChecker;
			describe("throttling", () => {
				const limitTenant = 10;
				// const limitCreateDoc = 5;
				// const limitGetDeltas = 5;
				// const limitGetSession = 5;
				beforeEach(() => {
					const restTenantThrottler = new TestThrottler(limitTenant);
					// const restTenantGetDeltasThrottler = new TestThrottler(limitTenant);
					// const restTenantCreateDocThrottler = new TestThrottler(limitTenant);
					// const restTenantGetSessionThrottler = new TestThrottler(limitTenant);
					const restTenantThrottlers = new Map<string, TestThrottler>();
					restTenantThrottlers.set(
						Constants.generalRestCallThrottleIdPrefix,
						restTenantThrottler,
					);
					// restTenantThrottlers.set(
					// 	Constants.getDeltasThrottleIdPrefix,
					// 	restTenantGetDeltasThrottler,
					// );
					// restTenantThrottlers.set(
					// 	Constants.createDocThrottleIdPrefix,
					// 	restTenantCreateDocThrottler,
					// );
					// restTenantThrottlers.set(
					// 	Constants.getSessionThrottleIdPrefix,
					// 	restTenantGetSessionThrottler,
					// );

					// const restCreateDocThrottler = new TestThrottler(limitCreateDoc);
					// const restGetDeltasThrottler = new TestThrottler(limitGetDeltas);
					// const restGetSessionThrottler = new TestThrottler(limitGetSession);
					// const restClusterThrottlers = new Map<string, TestThrottler>();
					// restClusterThrottlers.set(
					// 	Constants.createDocThrottleIdPrefix,
					// 	restCreateDocThrottler,
					// );
					// restClusterThrottlers.set(
					// 	Constants.getDeltasThrottleIdPrefix,
					// 	restGetDeltasThrottler,
					// );
					// restClusterThrottlers.set(
					// 	Constants.getSessionThrottleIdPrefix,
					// 	restGetSessionThrottler,
					// );
					const startupCheck = new StartupCheck();
					// testFluidAccessTokenGenerator = new TestFluidAccessTokenGenerator();
					const collabSessionEventEmitter =
						new TypedEventEmitter<ICollaborationSessionEvents>();
					app = nexusApp.create(
						defaultProvider,
						startupCheck,
						defaultTenantManager,
						undefined,
						restTenantThrottlers,
						collabSessionEventEmitter,
						defaultStorage,
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
							`/api/v1/tenants/${appTenant1.id}/accesstoken`,
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
					// const restTenantGetDeltasThrottler = new TestThrottler(maxThrottlerLimit);
					// const restTenantCreateDocThrottler = new TestThrottler(maxThrottlerLimit);
					// const restTenantGetSessionThrottler = new TestThrottler(maxThrottlerLimit);
					const restTenantThrottlers = new Map<string, TestThrottler>();
					restTenantThrottlers.set(
						Constants.generalRestCallThrottleIdPrefix,
						restTenantThrottler,
					);
					// restTenantThrottlers.set(
					// 	Constants.getDeltasThrottleIdPrefix,
					// 	restTenantGetDeltasThrottler,
					// );
					// restTenantThrottlers.set(
					// 	Constants.createDocThrottleIdPrefix,
					// 	restTenantCreateDocThrottler,
					// );
					// restTenantThrottlers.set(
					// 	Constants.getSessionThrottleIdPrefix,
					// 	restTenantGetSessionThrottler,
					// );

					// const restClusterCreateDocThrottler = new TestThrottler(maxThrottlerLimit);
					// const restClusterGetDeltasThrottler = new TestThrottler(maxThrottlerLimit);
					// const restClusterGetSessionThrottler = new TestThrottler(maxThrottlerLimit);
					// const restClusterThrottlers = new Map<string, TestThrottler>();
					// restClusterThrottlers.set(
					// 	Constants.createDocThrottleIdPrefix,
					// 	restClusterCreateDocThrottler,
					// );
					// restClusterThrottlers.set(
					// 	Constants.getDeltasThrottleIdPrefix,
					// 	restClusterGetDeltasThrottler,
					// );
					// restClusterThrottlers.set(
					// 	Constants.getSessionThrottleIdPrefix,
					// 	restClusterGetSessionThrottler,
					// );

					const startupCheck = new StartupCheck();
					// testFluidAccessTokenGenerator = new TestFluidAccessTokenGenerator();
					const collabSessionEventEmitter =
						new TypedEventEmitter<ICollaborationSessionEvents>();
					app = nexusApp.create(
						defaultProvider,
						startupCheck,
						defaultTenantManager,
						undefined,
						restTenantThrottlers,
						collabSessionEventEmitter,
						defaultStorage,
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
					// const restTenantGetDeltasThrottler = new TestThrottler(maxThrottlerLimit);
					// const restTenantCreateDocThrottler = new TestThrottler(maxThrottlerLimit);
					// const restTenantGetSessionThrottler = new TestThrottler(maxThrottlerLimit);
					const restTenantThrottlers = new Map<string, TestThrottler>();
					restTenantThrottlers.set(
						Constants.generalRestCallThrottleIdPrefix,
						restTenantThrottler,
					);
					// restTenantThrottlers.set(
					// 	Constants.getDeltasThrottleIdPrefix,
					// 	restTenantGetDeltasThrottler,
					// );
					// restTenantThrottlers.set(
					// 	Constants.createDocThrottleIdPrefix,
					// 	restTenantCreateDocThrottler,
					// );
					// restTenantThrottlers.set(
					// 	Constants.getSessionThrottleIdPrefix,
					// 	restTenantGetSessionThrottler,
					// );

					// const restClusterCreateDocThrottler = new TestThrottler(maxThrottlerLimit);
					// const restClusterGetDeltasThrottler = new TestThrottler(maxThrottlerLimit);
					// const restClusterGetSessionThrottler = new TestThrottler(maxThrottlerLimit);
					// const restClusterThrottlers = new Map<string, TestThrottler>();
					// restClusterThrottlers.set(
					// 	Constants.createDocThrottleIdPrefix,
					// 	restClusterCreateDocThrottler,
					// );
					// restClusterThrottlers.set(
					// 	Constants.getDeltasThrottleIdPrefix,
					// 	restClusterGetDeltasThrottler,
					// );
					// restClusterThrottlers.set(
					// 	Constants.getSessionThrottleIdPrefix,
					// 	restClusterGetSessionThrottler,
					// );

					const startupCheck = new StartupCheck();
					// testFluidAccessTokenGenerator = new TestFluidAccessTokenGenerator();
					const collabSessionEventEmitter =
						new TypedEventEmitter<ICollaborationSessionEvents>();
					app = nexusApp.create(
						defaultProvider,
						startupCheck,
						defaultTenantManager,
						undefined,
						restTenantThrottlers,
						collabSessionEventEmitter,
						defaultStorage,
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

			describe("session and discovery", () => {
				// let spyGetSession;

				beforeEach(() => {
					const maxThrottlerLimit = 1000000;
					const restTenantThrottler = new TestThrottler(maxThrottlerLimit);
					// const restTenantGetDeltasThrottler = new TestThrottler(maxThrottlerLimit);
					// const restTenantCreateDocThrottler = new TestThrottler(maxThrottlerLimit);
					// const restTenantGetSessionThrottler = new TestThrottler(maxThrottlerLimit);
					const restTenantThrottlers = new Map<string, TestThrottler>();
					restTenantThrottlers.set(
						Constants.generalRestCallThrottleIdPrefix,
						restTenantThrottler,
					);
					// restTenantThrottlers.set(
					// 	Constants.getDeltasThrottleIdPrefix,
					// 	restTenantGetDeltasThrottler,
					// );
					// restTenantThrottlers.set(
					// 	Constants.createDocThrottleIdPrefix,
					// 	restTenantCreateDocThrottler,
					// );
					// restTenantThrottlers.set(
					// 	Constants.getSessionThrottleIdPrefix,
					// 	restTenantGetSessionThrottler,
					// );

					// const restClusterCreateDocThrottler = new TestThrottler(maxThrottlerLimit);
					// const restClusterGetDeltasThrottler = new TestThrottler(maxThrottlerLimit);
					// const restClusterGetSessionThrottler = new TestThrottler(maxThrottlerLimit);
					// const restClusterThrottlers = new Map<string, TestThrottler>();
					// restClusterThrottlers.set(
					// 	Constants.createDocThrottleIdPrefix,
					// 	restClusterCreateDocThrottler,
					// );
					// restClusterThrottlers.set(
					// 	Constants.getDeltasThrottleIdPrefix,
					// 	restClusterGetDeltasThrottler,
					// );
					// restClusterThrottlers.set(
					// 	Constants.getSessionThrottleIdPrefix,
					// 	restClusterGetSessionThrottler,
					// );

					// spyGetSession = Sinon.spy(SessionHelper, "getSession");

					const startupCheck = new StartupCheck();
					// testFluidAccessTokenGenerator = new TestFluidAccessTokenGenerator();
					// testClusterDrainingStatusChecker = new TestClusterDrainingStatusChecker();
					const collabSessionEventEmitter =
						new TypedEventEmitter<ICollaborationSessionEvents>();
					app = nexusApp.create(
						defaultProvider,
						startupCheck,
						defaultTenantManager,
						undefined,
						restTenantThrottlers,
						collabSessionEventEmitter,
						defaultStorage,
					);
					supertest = request(app);
				});

				afterEach(() => {
					Sinon.restore();
				});

				describe("documents", () => {
					// it("/:tenantId/session/:id", async () => {
					// 	// Create a new session
					// 	Sinon.stub(defaultDocumentRepository, "updateOne").returns(
					// 		Promise.resolve(),
					// 	);
					// 	Sinon.stub(defaultDocumentRepository, "readOne")
					// 		.onFirstCall()
					// 		.returns(Promise.resolve({} as IDocument))
					// 		.onSecondCall()
					// 		.returns(
					// 			Promise.resolve({
					// 				session: {
					// 					ordererUrl: defaultProvider.get("worker:serverUrl"),
					// 					deltaStreamUrl:
					// 						defaultProvider.get("worker:deltaStreamUrl"),
					// 					historianUrl: defaultProvider.get("worker:blobStorageUrl"),
					// 					isSessionAlive: false,
					// 					isSessionActive: true,
					// 				},
					// 			} as IDocument),
					// 		);
					// 	await supertest
					// 		.get(`/documents/${appTenant1.id}/session/${document1._id}`)
					// 		.set("Authorization", tenantToken1)
					// 		.expect((res) => {
					// 			assert(spyGetSession.calledOnce);
					// 			assert.deepStrictEqual(res.body, {
					// 				ordererUrl: defaultProvider.get("worker:serverUrl"),
					// 				historianUrl: defaultProvider.get("worker:blobStorageUrl"),
					// 				deltaStreamUrl: defaultProvider.get("worker:deltaStreamUrl"),
					// 				isSessionAlive: false,
					// 				isSessionActive: false,
					// 			});
					// 		});
					// 	// Update an existing session
					// 	await supertest
					// 		.get(`/documents/${appTenant1.id}/session/${document1._id}`)
					// 		.set("Authorization", tenantToken1)
					// 		.expect((res) => {
					// 			assert(spyGetSession.calledTwice);
					// 			assert.deepStrictEqual(res.body, {
					// 				ordererUrl: defaultProvider.get("worker:serverUrl"),
					// 				historianUrl: defaultProvider.get("worker:blobStorageUrl"),
					// 				deltaStreamUrl: defaultProvider.get("worker:deltaStreamUrl"),
					// 				isSessionAlive: false,
					// 				isSessionActive: true,
					// 			});
					// 		});
					// 	// Error our when the cluster is draining
					// 	testClusterDrainingStatusChecker.setClusterDrainingStatus(true);
					// 	await supertest
					// 		.get(`/documents/${appTenant1.id}/session/${document1._id}`)
					// 		.set("Authorization", tenantToken1)
					// 		.expect((res) => {
					// 			assert.strictEqual(res.status, 503);
					// 		});
					// });
				});
			});

			describe("functionality", () => {
				const maxThrottlerLimit = 10;
				beforeEach(() => {
					const restTenantThrottler = new TestThrottler(maxThrottlerLimit);
					const restTenantGetDeltasThrottler = new TestThrottler(maxThrottlerLimit);
					const restTenantCreateDocThrottler = new TestThrottler(maxThrottlerLimit);
					const restTenantGetSessionThrottler = new TestThrottler(maxThrottlerLimit);
					const restTenantThrottlers = new Map<string, TestThrottler>();
					restTenantThrottlers.set(
						Constants.generalRestCallThrottleIdPrefix,
						restTenantThrottler,
					);
					restTenantThrottlers.set(
						Constants.getDeltasThrottleIdPrefix,
						restTenantGetDeltasThrottler,
					);
					restTenantThrottlers.set(
						Constants.createDocThrottleIdPrefix,
						restTenantCreateDocThrottler,
					);
					restTenantThrottlers.set(
						Constants.getSessionThrottleIdPrefix,
						restTenantGetSessionThrottler,
					);

					const restClusterCreateDocThrottler = new TestThrottler(maxThrottlerLimit);
					const restClusterGetDeltasThrottler = new TestThrottler(maxThrottlerLimit);
					const restClusterGetSessionThrottler = new TestThrottler(maxThrottlerLimit);
					const restClusterThrottlers = new Map<string, TestThrottler>();
					restClusterThrottlers.set(
						Constants.createDocThrottleIdPrefix,
						restClusterCreateDocThrottler,
					);
					restClusterThrottlers.set(
						Constants.getDeltasThrottleIdPrefix,
						restClusterGetDeltasThrottler,
					);
					restClusterThrottlers.set(
						Constants.getSessionThrottleIdPrefix,
						restClusterGetSessionThrottler,
					);

					const startupCheck = new StartupCheck();
					// testClusterDrainingStatusChecker = new TestClusterDrainingStatusChecker();
					// testFluidAccessTokenGenerator = new TestFluidAccessTokenGenerator();
					const collabSessionEventEmitter =
						new TypedEventEmitter<ICollaborationSessionEvents>();
					app = nexusApp.create(
						defaultProvider,
						startupCheck,
						defaultTenantManager,
						undefined,
						restTenantThrottlers,
						collabSessionEventEmitter,
						defaultStorage,
					);
					supertest = request(app);
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
				});
			});
		});
	});
});
