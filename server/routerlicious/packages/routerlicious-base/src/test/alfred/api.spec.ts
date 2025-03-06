/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";
import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import { IAlfredTenant, NetworkError } from "@fluidframework/server-services-client";
import {
	IDocument,
	MongoDatabaseManager,
	MongoManager,
	TypedEventEmitter,
} from "@fluidframework/server-services-core";
import { StartupCheck } from "@fluidframework/server-services-shared";
import { Lumberjack, TestEngine1 } from "@fluidframework/server-services-telemetry";
import { generateToken } from "@fluidframework/server-services-utils";
import {
	TestCache,
	TestClusterDrainingStatusChecker,
	TestDbFactory,
	TestDocumentStorage,
	TestFluidAccessTokenGenerator,
	TestKafka,
	TestNotImplementedDocumentRepository,
	TestProducer,
	TestTenantManager,
	TestThrottler,
} from "@fluidframework/server-test-utils";
import assert from "assert";
import express from "express";
import nconf from "nconf";
import Sinon from "sinon";
import request from "supertest";
import * as alfredApp from "../../alfred/app";
import { DeltaService, DocumentDeleteService } from "../../alfred/services";
import { Constants } from "../../utils";
import * as SessionHelper from "../../utils/sessionHelper";

const nodeCollectionName = "testNodes";
const documentsCollectionName = "testDocuments";
const checkpointsCollectionName = "testCheckpoints";
const deltasCollectionName = "testDeltas";
const rawDeltasCollectionName = "testRawDeltas";
const defaultProvider = new nconf.Provider({}).defaults({
	alfred: {
		restJsonSize: 1000000,
	},
	auth: {
		maxTokenLifetimeSec: 1000000,
		enableTokenExpiration: true,
	},
	logger: {
		morganFormat: "json",
	},
	mongo: {
		collectionNames: {
			deltas: deltasCollectionName,
			rawDeltas: rawDeltasCollectionName,
		},
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
	describe("Alfred", () => {
		describe("API", async () => {
			const appTenant1: IAlfredTenant = {
				id: "default-tenant-1",
				key: "tenant-key-1",
			};
			const appTenant2: IAlfredTenant = {
				id: "default-tenant-2",
				key: "tenant-key-2",
			};
			const defaultAppTenants: IAlfredTenant[] = [appTenant1, appTenant2];
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
			const defaultSingleUseTokenCache = new TestCache();
			const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
			const tenantToken1 = `Basic ${generateToken(
				appTenant1.id,
				document1._id,
				appTenant1.key,
				scopes,
			)}`;
			const tenantToken2 = `Basic ${generateToken(
				appTenant2.id,
				document1._id,
				appTenant2.key,
				scopes,
			)}`;
			const tenantToken3 = `Basic ${generateToken(
				appTenant1.id,
				document1._id,
				appTenant1.key,
				scopes,
			)}`;
			const tenantToken4 = `Basic ${generateToken(
				appTenant1.id,
				document1._id,
				appTenant1.key,
				scopes,
			)}`;
			const defaultProducer = new TestProducer(new TestKafka());
			const deltasCollection = await defaultDbManager.getDeltaCollection(
				undefined,
				undefined,
			);
			const defaultDeltaService = new DeltaService(deltasCollection, defaultTenantManager);
			const defaultDocumentRepository = new TestNotImplementedDocumentRepository();
			const defaultDocumentDeleteService = new DocumentDeleteService();
			const defaultCollaborationSessionEventEmitter =
				new TypedEventEmitter<ICollaborationSessionEvents>();
			let app: express.Application;
			let supertest: request.SuperTest<request.Test>;
			let testFluidAccessTokenGenerator: TestFluidAccessTokenGenerator;
			let testClusterDrainingStatusChecker: TestClusterDrainingStatusChecker;
			describe("throttling", () => {
				const limitTenant = 10;
				const limitCreateDoc = 5;
				const limitGetDeltas = 5;
				const limitGetSession = 5;
				beforeEach(() => {
					const restTenantThrottler = new TestThrottler(limitTenant);
					const restTenantGetDeltasThrottler = new TestThrottler(limitTenant);
					const restTenantCreateDocThrottler = new TestThrottler(limitTenant);
					const restTenantGetSessionThrottler = new TestThrottler(limitTenant);
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

					const restCreateDocThrottler = new TestThrottler(limitCreateDoc);
					const restGetDeltasThrottler = new TestThrottler(limitGetDeltas);
					const restGetSessionThrottler = new TestThrottler(limitGetSession);
					const restClusterThrottlers = new Map<string, TestThrottler>();
					restClusterThrottlers.set(
						Constants.createDocThrottleIdPrefix,
						restCreateDocThrottler,
					);
					restClusterThrottlers.set(
						Constants.getDeltasThrottleIdPrefix,
						restGetDeltasThrottler,
					);
					restClusterThrottlers.set(
						Constants.getSessionThrottleIdPrefix,
						restGetSessionThrottler,
					);
					const startupCheck = new StartupCheck();
					testFluidAccessTokenGenerator = new TestFluidAccessTokenGenerator();
					app = alfredApp.create(
						defaultProvider,
						defaultTenantManager,
						restTenantThrottlers,
						restClusterThrottlers,
						defaultSingleUseTokenCache,
						defaultStorage,
						defaultAppTenants,
						defaultDeltaService,
						defaultProducer,
						defaultDocumentRepository,
						defaultDocumentDeleteService,
						startupCheck,
						undefined,
						undefined,
						defaultCollaborationSessionEventEmitter,
						undefined,
						undefined,
						undefined,
						testFluidAccessTokenGenerator,
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
					it("/ping", async () => {
						await assertThrottle("/api/v1/ping", undefined, undefined);
					});
					it("/tenants/:tenantid/accesstoken", async () => {
						await assertThrottle(
							`/api/v1/tenants/${appTenant1.id}/accesstoken`,
							"Bearer 12345", // Dummy bearer token
							undefined,
							"post",
						);
					});
					it("/:tenantId/:id/root", async () => {
						await assertThrottle(
							`/api/v1/${appTenant1.id}/${document1._id}/root`,
							undefined,
							undefined,
							"patch",
						);
					});
					it("/:tenantId/:id/blobs", async () => {
						await assertThrottle(
							`/api/v1/${appTenant1.id}/${document1._id}/blobs`,
							undefined,
							undefined,
							"post",
						);
					});
				});

				describe("/documents", () => {
					it("/:tenantId/:id", async () => {
						await assertThrottle(
							`/documents/${appTenant2.id}/${document1._id}`,
							tenantToken2,
							undefined,
						);
						await assertThrottle(
							`/documents/${appTenant1.id}/${document1._id}`,
							tenantToken1,
							undefined,
						);
						await supertest
							.get(`/documents/${appTenant1.id}/${document1._id}`)
							.set("Authorization", tenantToken1)
							.expect(429);
					});
					it("/:tenantId", async () => {
						const token = () =>
							`Basic ${generateToken(appTenant1.id, "", appTenant1.key, scopes)}`;
						await assertThrottle(
							`/documents/${appTenant1.id}`,
							token,
							{ id: "" },
							"post",
							limitCreateDoc,
						);
					});
				});

				describe("/deltas", () => {
					it("/raw/:tenantId/:id", async () => {
						await assertThrottle(
							`/deltas/raw/${appTenant2.id}/${document1._id}`,
							tenantToken2,
							undefined,
						);
						await assertThrottle(
							`/deltas/raw/${appTenant1.id}/${document1._id}`,
							tenantToken1,
							undefined,
						);
						await supertest
							.get(`/deltas/raw/${appTenant1.id}/${document1._id}`)
							.set("Authorization", tenantToken1)
							.expect(429);
					});
					it("/:tenantId/:id", async () => {
						await assertThrottle(
							`/deltas/${appTenant1.id}/${document1._id}`,
							tenantToken1,
							undefined,
							"get",
							limitGetDeltas,
						);
						await supertest
							.get(`/deltas/${appTenant1.id}/${document1._id}`)
							.set("Authorization", tenantToken1)
							.expect(429);
					});
					it("/v1/:tenantId/:id", async () => {
						await assertThrottle(
							`/deltas/v1/${appTenant2.id}/${document1._id}`,
							tenantToken2,
							undefined,
						);
						await assertThrottle(
							`/deltas/v1/${appTenant1.id}/${document1._id}`,
							tenantToken1,
							undefined,
						);
						await supertest
							.get(`/deltas/v1/${appTenant1.id}/${document1._id}`)
							.set("Authorization", tenantToken1)
							.expect(429);
					});
					it("/:tenantId/:id/v1", async () => {
						await assertThrottle(
							`/deltas/${appTenant2.id}/${document1._id}/v1`,
							tenantToken2,
							undefined,
						);
						await assertThrottle(
							`/deltas/${appTenant1.id}/${document1._id}/v1`,
							tenantToken1,
							undefined,
						);
						await supertest
							.get(`/deltas/${appTenant1.id}/${document1._id}/v1`)
							.set("Authorization", tenantToken1)
							.expect(429);
					});
				});
			});

			describe("authorization", () => {
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
					testFluidAccessTokenGenerator = new TestFluidAccessTokenGenerator();
					app = alfredApp.create(
						defaultProvider,
						defaultTenantManager,
						restTenantThrottlers,
						restClusterThrottlers,
						defaultSingleUseTokenCache,
						defaultStorage,
						defaultAppTenants,
						defaultDeltaService,
						defaultProducer,
						defaultDocumentRepository,
						defaultDocumentDeleteService,
						startupCheck,
						undefined,
						undefined,
						defaultCollaborationSessionEventEmitter,
						undefined,
						undefined,
						undefined,
						testFluidAccessTokenGenerator,
					);
					supertest = request(app);
				});

				describe("/api/v1", () => {
					it("/api/v1/tenants/:tenantid/accesstoken", async () => {
						const body = {
							documentId: "doc-1",
						};

						await supertest
							.post(`/api/v1/tenants/${appTenant1.id}/accesstoken`)
							.set("Authorization", "Bearer 12345")
							.set("Content-Type", "application/json")
							.send(body)
							.expect(201);
					});
					it("/api/v1/tenants/:tenantid/accesstoken missing-bearer-token", async () => {
						const body = {
							documentId: "doc-1",
						};

						await supertest
							.post(`/api/v1/tenants/${appTenant1.id}/accesstoken`)
							.set("Content-Type", "application/json")
							.send(body)
							.expect(400);
					});
					it("/api/v1/tenants/:tenantid/accesstoken invalid-token", async () => {
						const body = {
							documentId: "doc-1",
						};

						await supertest
							.post(`/api/v1/tenants/${appTenant1.id}/accesstoken`)
							.set("Authorization", "Basic 12345")
							.set("Content-Type", "application/json")
							.send(body)
							.expect(400);
					});
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

				describe("/documents", () => {
					it("/:tenantId/:id", async () => {
						await supertest
							.get(`/documents/${appTenant1.id}/${document1._id}`)
							.set("Authorization", tenantToken1)
							.expect(200);
					});
					it("/:tenantId/:id-NotFound", async () => {
						const nonExistingDocumentId = "nonExistingDocumentId";
						const tenantToken1OnNonExistingDocument = `Basic ${generateToken(
							appTenant1.id,
							nonExistingDocumentId,
							appTenant1.key,
							scopes,
						)}`;
						await supertest
							.get(`/documents/${appTenant1.id}/${nonExistingDocumentId}`)
							.set("Authorization", tenantToken1OnNonExistingDocument)
							.expect(404);
					});
					it("/:tenantId/:id-invalidToken", async () => {
						await supertest
							.get(`/documents/${appTenant1.id}/${document1._id}`)
							.expect(403);
					});
					it("/:tenantId", async () => {
						await supertest
							.post(`/documents/${appTenant1.id}`)
							.set("Authorization", tenantToken1)
							.send({ id: document1._id })
							.expect((res) => {
								assert.notStrictEqual(res.status, 401);
								assert.notStrictEqual(res.status, 403);
							});
					});
					it("/:tenantId-invalidtoken", async () => {
						await supertest
							.post(`/documents/${appTenant1.id}`)
							.send({ id: document1._id })
							.expect(403);
					});
				});

				describe("/deltas-invalidToken", () => {
					it("/raw/:tenantId/:id", async () => {
						await supertest
							.get(`/deltas/raw/${appTenant2.id}/${document1._id}`)
							.expect(403);
					});
					it("/:tenantId/:id", async () => {
						await supertest
							.get(`/deltas/${appTenant2.id}/${document1._id}`)
							.expect(403);
					});
					it("/v1/:tenantId/:id", async () => {
						await supertest
							.get(`/deltas/v1/${appTenant2.id}/${document1._id}`)
							.expect(403);
					});
					it("/:tenantId/:id/v1", async () => {
						await supertest
							.get(`/deltas/${appTenant2.id}/${document1._id}/v1`)
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
					testFluidAccessTokenGenerator = new TestFluidAccessTokenGenerator();
					app = alfredApp.create(
						defaultProvider,
						defaultTenantManager,
						restTenantThrottlers,
						restClusterThrottlers,
						defaultSingleUseTokenCache,
						defaultStorage,
						defaultAppTenants,
						defaultDeltaService,
						defaultProducer,
						defaultDocumentRepository,
						defaultDocumentDeleteService,
						startupCheck,
						undefined,
						undefined,
						defaultCollaborationSessionEventEmitter,
						undefined,
						undefined,
						undefined,
						testFluidAccessTokenGenerator,
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
					it("/ping", async () => {
						await assertCorrelationId("/api/v1/ping");
					});
					it("/tenants/:tenantid/accesstoken", async () => {
						await assertCorrelationId(
							`/api/v1/tenants/${appTenant1.id}/accesstoken`,
							"post",
						);
					});
					it("/:tenantId/:id/root", async () => {
						await assertCorrelationId(
							`/api/v1/${appTenant1.id}/${document1._id}/root`,
							"patch",
						);
					});
					it("/:tenantId/:id/blobs", async () => {
						await assertCorrelationId(
							`/api/v1/${appTenant1.id}/${document1._id}/blobs`,
							"post",
						);
					});
					it("/api/v1/:tenantId/:id/broadcast-signal", async () => {
						await assertCorrelationId(
							`/api/v1/${appTenant1.id}/${document1._id}/broadcast-signal`,
							"post",
						);
					});
				});

				describe("/documents", () => {
					it("/:tenantId/:id", async () => {
						await assertCorrelationId(`/documents/${appTenant1.id}/${document1._id}`);
					});
					it("/:tenantId", async () => {
						await assertCorrelationId(`/documents/${appTenant1.id}`, "post");
					});
				});

				describe("/deltas", () => {
					it("/raw/:tenantId/:id", async () => {
						await assertCorrelationId(`/deltas/raw/${appTenant1.id}/${document1._id}`);
					});
					it("/:tenantId/:id", async () => {
						await assertCorrelationId(`/deltas/${appTenant1.id}/${document1._id}`);
					});
					it("/v1/:tenantId/:id", async () => {
						await assertCorrelationId(`/deltas/v1/${appTenant1.id}/${document1._id}`);
					});
					it("/:tenantId/:id/v1", async () => {
						await assertCorrelationId(`/deltas/${appTenant1.id}/${document1._id}/v1`);
					});
				});
			});

			describe("single-use JWTs", () => {
				const limit = 1000000;
				beforeEach(() => {
					const restTenantThrottler = new TestThrottler(limit);
					const restTenantGetDeltasThrottler = new TestThrottler(limit);
					const restTenantCreateDocThrottler = new TestThrottler(limit);
					const restTenantGetSessionThrottler = new TestThrottler(limit);
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

					const restClusterCreateDocThrottler = new TestThrottler(limit);
					const restClusterGetDeltasThrottler = new TestThrottler(limit);
					const restClusterGetSessionThrottler = new TestThrottler(limit);
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
					testFluidAccessTokenGenerator = new TestFluidAccessTokenGenerator();
					app = alfredApp.create(
						defaultProvider,
						defaultTenantManager,
						restTenantThrottlers,
						restClusterThrottlers,
						new TestCache(),
						defaultStorage,
						defaultAppTenants,
						defaultDeltaService,
						defaultProducer,
						defaultDocumentRepository,
						defaultDocumentDeleteService,
						startupCheck,
						undefined,
						undefined,
						undefined,
						undefined,
						undefined,
						undefined,
						testFluidAccessTokenGenerator,
					);
					supertest = request(app);
				});
				describe("/documents", () => {
					it("/:tenantId", async () => {
						const url = `/documents/${appTenant1.id}`;
						await supertest
							.post(url)
							.set("Authorization", tenantToken1)
							.send({ id: "" })
							.expect((res) => {
								assert.notStrictEqual(res.status, 401);
								assert.notStrictEqual(res.status, 403);
							});

						await supertest
							.post(url)
							.set("Authorization", tenantToken1)
							.send({ id: "" })
							.expect(403);
					});
				});
			});

			describe("session and discovery", () => {
				let spyGetSession;

				beforeEach(() => {
					const maxThrottlerLimit = 1000000;
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

					spyGetSession = Sinon.spy(SessionHelper, "getSession");

					const startupCheck = new StartupCheck();
					testFluidAccessTokenGenerator = new TestFluidAccessTokenGenerator();
					testClusterDrainingStatusChecker = new TestClusterDrainingStatusChecker();
					app = alfredApp.create(
						defaultProvider,
						defaultTenantManager,
						restTenantThrottlers,
						restClusterThrottlers,
						defaultSingleUseTokenCache,
						defaultStorage,
						defaultAppTenants,
						defaultDeltaService,
						defaultProducer,
						defaultDocumentRepository,
						defaultDocumentDeleteService,
						startupCheck,
						undefined,
						undefined,
						undefined,
						testClusterDrainingStatusChecker,
						undefined,
						undefined,
						testFluidAccessTokenGenerator,
					);
					supertest = request(app);
				});

				afterEach(() => {
					Sinon.restore();
				});

				describe("documents", () => {
					it("/:tenantId/session/:id", async () => {
						// Create a new session
						Sinon.stub(defaultDocumentRepository, "updateOne").returns(
							Promise.resolve(),
						);
						Sinon.stub(defaultDocumentRepository, "readOne")
							.onFirstCall()
							.returns(Promise.resolve({} as IDocument))
							.onSecondCall()
							.returns(
								Promise.resolve({
									session: {
										ordererUrl: defaultProvider.get("worker:serverUrl"),
										deltaStreamUrl:
											defaultProvider.get("worker:deltaStreamUrl"),
										historianUrl: defaultProvider.get("worker:blobStorageUrl"),
										isSessionAlive: false,
										isSessionActive: true,
									},
								} as IDocument),
							);

						await supertest
							.get(`/documents/${appTenant1.id}/session/${document1._id}`)
							.set("Authorization", tenantToken1)
							.expect((res) => {
								assert(spyGetSession.calledOnce);
								assert.deepStrictEqual(res.body, {
									ordererUrl: defaultProvider.get("worker:serverUrl"),
									historianUrl: defaultProvider.get("worker:blobStorageUrl"),
									deltaStreamUrl: defaultProvider.get("worker:deltaStreamUrl"),
									isSessionAlive: false,
									isSessionActive: false,
								});
							});

						// Update an existing session
						await supertest
							.get(`/documents/${appTenant1.id}/session/${document1._id}`)
							.set("Authorization", tenantToken1)
							.expect((res) => {
								assert(spyGetSession.calledTwice);
								assert.deepStrictEqual(res.body, {
									ordererUrl: defaultProvider.get("worker:serverUrl"),
									historianUrl: defaultProvider.get("worker:blobStorageUrl"),
									deltaStreamUrl: defaultProvider.get("worker:deltaStreamUrl"),
									isSessionAlive: false,
									isSessionActive: true,
								});
							});

						// Error our when the cluster is draining
						testClusterDrainingStatusChecker.setClusterDrainingStatus(true);
						await supertest
							.get(`/documents/${appTenant1.id}/session/${document1._id}`)
							.set("Authorization", tenantToken1)
							.expect((res) => {
								assert.strictEqual(res.status, 503);
							});
					});
				});
			});

			describe("/deltas-errorHandling", () => {
				let getDeltasStub;

				afterEach(() => {
					// Restore the original method after each test
					if (getDeltasStub) getDeltasStub.restore();
				});

				it("should return 404 when document is not found", async () => {
					getDeltasStub = Sinon.stub(DeltaService.prototype, "getDeltas").rejects(
						new NetworkError(404, "Document not found"),
					);

					const response = await supertest
						.get(`/deltas/raw/${appTenant1.id}/${document1._id}`)
						.set("Authorization", tenantToken1)
						.expect(404);

					assert.strictEqual(response.status, 404);
					assert.strictEqual(response.body, "Document not found");
				});

				it("should return 500 when an internal Non-network error occurs", async () => {
					getDeltasStub = Sinon.stub(DeltaService.prototype, "getDeltas").rejects(
						new Error("Internal Error 499"),
					); // Not a NetworkError, simulating an internal issue

					const response = await supertest
						.get(`/deltas/raw/${appTenant1.id}/${document1._id}`)
						.set("Authorization", tenantToken1)
						.expect(500);

					assert.strictEqual(response.status, 500);
					assert.strictEqual(response.body, "Internal Server Error"); // Modify based on actual error handling
				});

				it("should return 500 when an internal 500 error occurs", async () => {
					getDeltasStub = Sinon.stub(DeltaService.prototype, "getDeltas").rejects(
						new NetworkError(500, "Internal Server Error"),
					);

					const response = await supertest
						.get(`/deltas/raw/${appTenant1.id}/${document1._id}`)
						.set("Authorization", tenantToken1)
						.expect(500);

					assert.strictEqual(response.status, 500);
					assert.strictEqual(response.body, "Internal Server Error");
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
					testClusterDrainingStatusChecker = new TestClusterDrainingStatusChecker();
					testFluidAccessTokenGenerator = new TestFluidAccessTokenGenerator();
					app = alfredApp.create(
						defaultProvider,
						defaultTenantManager,
						restTenantThrottlers,
						restClusterThrottlers,
						defaultSingleUseTokenCache,
						defaultStorage,
						defaultAppTenants,
						defaultDeltaService,
						defaultProducer,
						defaultDocumentRepository,
						defaultDocumentDeleteService,
						startupCheck,
						undefined,
						undefined,
						defaultCollaborationSessionEventEmitter,
						testClusterDrainingStatusChecker,
						undefined,
						undefined,
						testFluidAccessTokenGenerator,
					);
					supertest = request(app);
				});

				describe("/api/v1", () => {
					it("/tenants/:tenantid/accesstoken validate access token exists in response", async () => {
						const body = {
							documentId: "doc-1",
							customClaims: {
								claim1: "value1",
								claim2: "value2",
							},
						};

						await supertest
							.post(`/api/v1/tenants/${appTenant1.id}/accesstoken`)
							.set("Authorization", "Bearer 12345")
							.set("Content-Type", "application/json")
							.send(body)
							.expect((res) => {
								assert.strictEqual(res.status, 201);
								assert.notStrictEqual(res.body.fluidAccessToken, undefined);
							});
					});
					it("/tenants/:tenantid/accesstoken bearer token validation failure", async () => {
						testFluidAccessTokenGenerator.setFailSignatureValidation();
						await supertest
							.post(`/api/v1/tenants/${appTenant1.id}/accesstoken`)
							.set("Authorization", "Bearer 12345")
							.set("Content-Type", "application/json")
							.expect(401);
					});
					it("/tenants/:tenantid/accesstoken authorization failure", async () => {
						testFluidAccessTokenGenerator.setFailAuthorizationValidation();
						await supertest
							.post(`/api/v1/tenants/${appTenant1.id}/accesstoken`)
							.set("Authorization", "Bearer 12345")
							.set("Content-Type", "application/json")
							.expect(403);
					});
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

				describe("/documents", () => {
					it("/:tenantId cluster in draining status", async () => {
						testClusterDrainingStatusChecker.setClusterDrainingStatus(true);

						await supertest
							.post(`/documents/${appTenant1.id}`)
							.set("Authorization", tenantToken3)
							.send({ id: document1._id })
							.expect((res) => {
								assert.strictEqual(res.status, 503);
								return true;
							});
					});

					it("/:tenantId cluster not in draining status", async () => {
						await supertest
							.post(`/documents/${appTenant1.id}`)
							.set("Authorization", tenantToken4)
							.send({ id: document1._id })
							.expect((res) => {
								assert.notStrictEqual(res.status, 503);
								return true;
							});
					});
				});
			});
		});
	});
});
