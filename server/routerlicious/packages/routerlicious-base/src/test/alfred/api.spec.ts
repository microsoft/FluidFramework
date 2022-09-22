/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import express from "express";
import request from "supertest";
import nconf from "nconf";
import { Lumberjack, TestEngine1 } from "@fluidframework/server-services-telemetry";
import { TestTenantManager, TestThrottler, TestDocumentStorage, TestDbFactory, TestProducer, TestKafka } from "@fluidframework/server-test-utils";
import { IDocument, MongoDatabaseManager, MongoManager } from "@fluidframework/server-services-core";
import * as alfredApp from "../../alfred/app";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { generateToken } from "@fluidframework/server-services-utils";
import { TestCache } from "@fluidframework/server-test-utils";
import { DeltaService } from "../../alfred/services";

const nodeCollectionName = "testNodes";
const documentsCollectionName = "testDocuments";
const deltasCollectionName = "testDeltas";
const rawDeltasCollectionName = "testRawDeltas";
const defaultProvider = new nconf.Provider({}).defaults({
    alfred: {
        restJsonSize: 1000000,
    },
    auth: {
        maxTokenLifetimeSec: 1000000,
        enableTokenExpiration: true
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
        blobStorageUrl: "http://localhost:3001"
    }
});

if (!Lumberjack.isSetupCompleted()) {
    Lumberjack.setup([new TestEngine1()]);
}

describe("Routerlicious", () => {
    describe("Alfred", () => {
        describe("API", async () => {
            const defaultTenantManager = new TestTenantManager();
            const document1 = {
                _id: "doc-1",
                content: "Hello, World!",
            }
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
                deltasCollectionName,
                rawDeltasCollectionName);
            const defaultStorage = new TestDocumentStorage(defaultDbManager, defaultTenantManager);
            const appTenant1: IAlfredTenant = {
                id: "default-tenant-1",
                key: "tenant-key-1",
            };
            const appTenant2: IAlfredTenant = {
                id: "default-tenant-2",
                key: "tenant-key-2",
            };
            const defaultAppTenants: IAlfredTenant[] = [
                appTenant1,
                appTenant2,
            ];
            const defaultSingleUseTokenCache = new TestCache();
            const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite]
            const tenantToken1 = `Basic ${generateToken(appTenant1.id, document1._id, appTenant1.key, scopes)}`;
            const tenantToken2 = `Basic ${generateToken(appTenant2.id, document1._id, appTenant2.key, scopes)}`;
            const defaultProducer = new TestProducer(new TestKafka());
            const defaultDb = await defaultMongoManager.getDatabase();
            const defaultDeltaService = new DeltaService(defaultMongoManager, defaultTenantManager);
            const defaultDocumentsCollection = defaultDb.collection<IDocument>(documentsCollectionName);
            let app: express.Application;
            let supertest: request.SuperTest<request.Test>;
            describe("throttling", () => {
                const limit = 10;
                beforeEach(() => {
                    const throttler = new TestThrottler(limit);
                    app = alfredApp.create(
                        defaultProvider,
                        defaultTenantManager,
                        throttler,
                        defaultSingleUseTokenCache,
                        defaultStorage,
                        defaultAppTenants,
                        defaultDeltaService,
                        defaultProducer,
                        defaultDocumentsCollection);
                    supertest = request(app);
                });

                const assertThrottle = async (url: string, token: string | (() => string), body: any, method: "get" | "post" | "patch" = "get"): Promise<void> => {
                    const tokenProvider = typeof token === "function" ? token : () => token;
                    for (let i = 0; i < limit; i++) {
                        // we're not interested in making the requests succeed with 200s, so just assert that not 429
                        await supertest[method](url)
                            .set('Authorization', tokenProvider())
                            .send(body)
                            .expect((res) => {
                                assert.notStrictEqual(res.status, 429);
                            });
                    };
                    await supertest[method](url)
                        .set('Authorization', tokenProvider())
                        .send(body)
                        .expect(429);
                };

                describe("/api/v1", () => {
                    it("/ping", async () => {
                        await assertThrottle("/api/v1/ping", null, null);
                    });
                    it("/:tenantId/:id/root", async () => {
                        await assertThrottle(`/api/v1/${appTenant1.id}/${document1._id}/root`, null, null, "patch");
                    });
                    it("/:tenantId/:id/blobs", async () => {
                        await assertThrottle(`/api/v1/${appTenant1.id}/${document1._id}/blobs`, null, null, "post");
                    });
                });

                describe("/documents", () => {
                    it("/:tenantId/:id", async () => {
                        await assertThrottle(`/documents/${appTenant2.id}/${document1._id}`, tenantToken2, null);
                        await assertThrottle(`/documents/${appTenant1.id}/${document1._id}`, tenantToken1, null);
                        await supertest.get(`/documents/${appTenant1.id}/${document1._id}`)
                            .set('Authorization', tenantToken1)
                            .expect(429);
                    });
                    it("/:tenantId", async () => {
                        const token = () => `Basic ${generateToken(appTenant1.id, "", appTenant1.key, scopes)}`;
                        await assertThrottle(`/documents/${appTenant1.id}`, token, { id: "" }, "post");
                    });
                });

                describe("/deltas", () => {
                    it("/raw/:tenantId/:id", async () => {
                        await assertThrottle(`/deltas/raw/${appTenant2.id}/${document1._id}`, tenantToken2, null);
                        await assertThrottle(`/deltas/raw/${appTenant1.id}/${document1._id}`, tenantToken1, null);
                        await supertest.get(`/deltas/raw/${appTenant1.id}/${document1._id}`)
                            .set('Authorization', tenantToken1)
                            .expect(429);
                    });
                    it("/:tenantId/:id", async () => {
                        await assertThrottle(`/deltas/${appTenant2.id}/${document1._id}`, tenantToken2, null);
                        await assertThrottle(`/deltas/${appTenant1.id}/${document1._id}`, tenantToken1, null);
                        await supertest.get(`/deltas/${appTenant1.id}/${document1._id}`)
                            .set('Authorization', tenantToken1)
                            .expect(429);
                    });
                    it("/v1/:tenantId/:id", async () => {
                        await assertThrottle(`/deltas/v1/${appTenant2.id}/${document1._id}`, tenantToken2, null);
                        await assertThrottle(`/deltas/v1/${appTenant1.id}/${document1._id}`, tenantToken1, null);
                        await supertest.get(`/deltas/v1/${appTenant1.id}/${document1._id}`)
                            .set('Authorization', tenantToken1)
                            .expect(429);
                    });
                    it("/:tenantId/:id/v1", async () => {
                        await assertThrottle(`/deltas/${appTenant2.id}/${document1._id}/v1`, tenantToken2, null);
                        await assertThrottle(`/deltas/${appTenant1.id}/${document1._id}/v1`, tenantToken1, null);
                        await supertest.get(`/deltas/${appTenant1.id}/${document1._id}/v1`)
                            .set('Authorization', tenantToken1)
                            .expect(429);
                    });
                });
            });

            describe("authorization", () => {
                const maxThrottlerLimit = 10;
                beforeEach(() => {
                    const throttler = new TestThrottler(maxThrottlerLimit);
                    app = alfredApp.create(
                        defaultProvider,
                        defaultTenantManager,
                        throttler,
                        defaultSingleUseTokenCache,
                        defaultStorage,
                        defaultAppTenants,
                        defaultDeltaService,
                        defaultProducer,
                        defaultDocumentsCollection);
                    supertest = request(app);
                });

                describe("/documents", () => {
                    it("/:tenantId/:id", async () => {
                        await supertest.get(`/documents/${appTenant1.id}/${document1._id}`)
                            .set('Authorization', tenantToken1)
                            .expect(200);
                    });
                    it("/:tenantId/:id-invalidToken", async () => {
                        await supertest.get(`/documents/${appTenant1.id}/${document1._id}`)
                            .expect(403);
                    });
                    it("/:tenantId", async () => {
                        await supertest.post(`/documents/${appTenant1.id}`)
                            .set('Authorization', tenantToken1)
                            .send({ id: document1._id })
                            .expect((res) => {
                                assert.notStrictEqual(res.status, 401);
                                assert.notStrictEqual(res.status, 403);
                            });
                    });
                    it("/:tenantId-invalidtoken", async () => {
                        await supertest.post(`/documents/${appTenant1.id}`)
                            .send({ id: document1._id })
                            .expect(403);
                    });
                });

                describe("/deltas-invalidToken", () => {
                    it("/raw/:tenantId/:id", async () => {
                        await supertest.get(`/deltas/raw/${appTenant2.id}/${document1._id}`)
                            .expect(403);
                    });
                    it("/:tenantId/:id", async () => {
                        await supertest.get(`/deltas/${appTenant2.id}/${document1._id}`)
                            .expect(403);
                    });
                    it("/v1/:tenantId/:id", async () => {
                        await supertest.get(`/deltas/v1/${appTenant2.id}/${document1._id}`)
                            .expect(403);
                    });
                    it("/:tenantId/:id/v1", async () => {
                        await supertest.get(`/deltas/${appTenant2.id}/${document1._id}/v1`)
                            .expect(403);
                    });
                });
            });

            describe("CorrelationId", () => {
                const correlationIdHeaderName = "x-correlation-id";
                const testCorrelationId = "test-correlation-id";

                const maxThrottlerLimit = 1000000;
                beforeEach(() => {
                    const throttler = new TestThrottler(maxThrottlerLimit);
                    app = alfredApp.create(
                        defaultProvider,
                        defaultTenantManager,
                        throttler,
                        defaultSingleUseTokenCache,
                        defaultStorage,
                        defaultAppTenants,
                        defaultDeltaService,
                        defaultProducer,
                        defaultDocumentsCollection);
                    supertest = request(app);
                });

                const assertCorrelationId = async (url: string, method: "get" | "post" | "put" | "patch" | "delete" = "get"): Promise<void> => {
                    await supertest[method](url)
                        .set(correlationIdHeaderName, testCorrelationId)
                        .then((res) => {
                            assert.strictEqual(res.header?.[correlationIdHeaderName], testCorrelationId);
                        });
                };

                describe("/api/v1", () => {
                    it("/ping", async () => {
                        await assertCorrelationId("/api/v1/ping");
                    });
                    it("/:tenantId/:id/root", async () => {
                        await assertCorrelationId(`/api/v1/${appTenant1.id}/${document1._id}/root`, "patch");
                    });
                    it("/:tenantId/:id/blobs", async () => {
                        await assertCorrelationId(`/api/v1/${appTenant1.id}/${document1._id}/blobs`, "post");
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
                    const throttler = new TestThrottler(limit);
                    app = alfredApp.create(
                        defaultProvider,
                        defaultTenantManager,
                        throttler,
                        new TestCache(),
                        defaultStorage,
                        defaultAppTenants,
                        defaultDeltaService,
                        defaultProducer,
                        defaultDocumentsCollection);
                    supertest = request(app);
                });
                describe("/documents", () => {
                    it("/:tenantId", async () => {
                        const url = `/documents/${appTenant1.id}`;
                        await supertest.post(url)
                            .set('Authorization', tenantToken1)
                            .send({ id: "" })
                            .expect((res) => {
                                assert.notStrictEqual(res.status, 401);
                                assert.notStrictEqual(res.status, 403);
                            });

                        await supertest.post(url)
                            .set('Authorization', tenantToken1)
                            .send({ id: "" })
                            .expect(403);
                    });
                });
            });
        });
    });
});
