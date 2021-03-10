/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import express from "express";
import request from "supertest";
import nconf from "nconf";
import { TestTenantManager, TestThrottler, TestDocumentStorage, TestDbFactory, TestProducer, TestKafka } from "@fluidframework/server-test-utils";
import { MongoDatabaseManager, MongoManager } from "@fluidframework/server-services-core";
import * as alfredApp from "../../alfred/app";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { generateToken } from "@fluidframework/server-services-utils";

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
        morganFormat: "dev",
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

describe("Routerlicious", () => {
    describe("Alfred", () => {
        describe("API", () => {
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
            const defaultDbManager = new MongoDatabaseManager(
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
            const scopes= [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite]
            const tenantToken1 =`Basic ${generateToken(appTenant1.id, document1._id, appTenant1.key, scopes)}`;
            const tenantToken2 =`Basic ${generateToken(appTenant2.id, document1._id, appTenant2.key, scopes)}`;
            const defaultProducer = new TestProducer(new TestKafka());
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
                        defaultStorage,
                        defaultAppTenants,
                        defaultMongoManager,
                        defaultProducer);
                    supertest = request(app);
                });

                const assertThrottle = async (url: string, token: string, body: any, method: "get" | "post" | "patch" = "get"): Promise<void> => {
                    for (let i = 0; i < limit; i++) {
                        // we're not interested in making the requests succeed with 200s, so just assert that not 429
                        await supertest[method](url)
                            .set('Authorization', token)
                            .send(body)
                            .expect((res) => {
                                assert.notStrictEqual(res.status, 429);
                            });
                    };
                    await supertest[method](url)
                        .set('Authorization', token)
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
                        await assertThrottle(`/documents/${appTenant1.id}`, tenantToken1, {id: document1._id}, "post");
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
                        defaultStorage,
                        defaultAppTenants,
                        defaultMongoManager,
                        defaultProducer);
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
                            .expect(401);
                    });
                    it("/:tenantId", async () => {
                        await supertest.post(`/documents/${appTenant1.id}`)
                            .set('Authorization', tenantToken1)
                            .send({id: document1._id})
                            .expect((res) => {
                                assert.notStrictEqual(res.status, 401);
                            });
                    });
                    it("/:tenantId-invalidtoken", async () => {
                        await supertest.post(`/documents/${appTenant1.id}`)
                            .send({id: document1._id})
                            .expect(401);
                    });
                });

                describe("/deltas-invalidToken", () => {
                    it("/raw/:tenantId/:id", async () => {
                        await supertest.get(`/deltas/raw/${appTenant2.id}/${document1._id}`)
                            .expect(401);
                    });
                    it("/:tenantId/:id", async () => {
                        await supertest.get(`/deltas/${appTenant2.id}/${document1._id}`)
                            .expect(401);
                    });
                    it("/v1/:tenantId/:id", async () => {
                        await supertest.get(`/deltas/v1/${appTenant2.id}/${document1._id}`)
                            .expect(401);
                    });
                    it("/:tenantId/:id/v1", async () => {
                        await supertest.get(`/deltas/${appTenant2.id}/${document1._id}/v1`)
                            .expect(401);
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
                        defaultStorage,
                        defaultAppTenants,
                        defaultMongoManager,
                        defaultProducer);
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
                    it("/:tenantId/:id/blobs", async () => {
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
        });
    });
});
