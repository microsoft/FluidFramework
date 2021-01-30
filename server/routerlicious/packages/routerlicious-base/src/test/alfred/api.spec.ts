/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import express from "express";
import request from "supertest";
import * as nconf from "nconf";
import { TestTenantManager, TestThrottler, TestDocumentStorage, TestDbFactory, TestProducer, TestKafka } from "@fluidframework/server-test-utils";
import { MongoDatabaseManager, MongoManager } from "@fluidframework/server-services-core";
import * as alfredApp from "../../alfred/app";
import { IAlfredTenant } from "@fluidframework/server-services-client";

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

                const assertThrottle = async (url: string, method: "get" | "post" | "patch" = "get"): Promise<void> => {
                    for (let i = 0; i < limit; i++) {
                        // we're not interested in making the requests succeed with 200s, so just assert that not 429
                        await supertest[method](url).expect((res) => {
                            assert.notStrictEqual(res.status, 429);
                        });
                    };
                    await supertest[method](url).expect(429);
                };

                describe("/api/v1", () => {
                    it("/ping", async () => {
                        await assertThrottle("/api/v1/ping");
                    });
                    it("/:tenantId/:id/root", async () => {
                        await assertThrottle(`/api/v1/${appTenant1.id}/${document1._id}/root`, "patch");
                    });
                    it("/:tenantId/:id/blobs", async () => {
                        await assertThrottle(`/api/v1/${appTenant1.id}/${document1._id}/blobs`, "post");
                    });
                });

                describe("/documents", () => {
                    it("/:tenantId?/:id", async () => {
                        await assertThrottle(`/documents/${appTenant2.id}/${document1._id}`);
                        // no provided tenantId should default to appTenants[0]
                        await assertThrottle(`/documents/${document1._id}`);
                        await supertest.get(`/documents/${appTenant1.id}/${document1._id}`).expect(429);
                    });
                    it("/:tenantId/:id/blobs", async () => {
                        await assertThrottle(`/documents/${appTenant1.id}`, "post");
                    });
                });

                describe("/deltas", () => {
                    it("/raw/:tenantId?/:id", async () => {
                        await assertThrottle(`/deltas/raw/${appTenant2.id}/${document1._id}`);
                        // no provided tenantId should default to appTenants[0]
                        await assertThrottle(`/deltas/raw/${document1._id}`);
                        await supertest.get(`/deltas/raw/${appTenant1.id}/${document1._id}`).expect(429);
                    });
                    it("/:tenantId?/:id", async () => {
                        await assertThrottle(`/deltas/${appTenant2.id}/${document1._id}`);
                        // no provided tenantId should default to appTenants[0]
                        await assertThrottle(`/deltas/${document1._id}`);
                        await supertest.get(`/deltas/${appTenant1.id}/${document1._id}`).expect(429);
                    });
                    it("/v1/:tenantId?/:id", async () => {
                        await assertThrottle(`/deltas/v1/${appTenant2.id}/${document1._id}`);
                        // no provided tenantId should default to appTenants[0]
                        await assertThrottle(`/deltas/v1/${document1._id}`);
                        await supertest.get(`/deltas/v1/${appTenant1.id}/${document1._id}`).expect(429);
                    });
                    it("/:tenantId?/:id/v1", async () => {
                        await assertThrottle(`/deltas/${appTenant2.id}/${document1._id}/v1`);
                        // no provided tenantId should default to appTenants[0]
                        await assertThrottle(`/deltas/${document1._id}/v1`);
                        await supertest.get(`/deltas/${appTenant1.id}/${document1._id}/v1`).expect(429);
                    });
                });
            });

            describe("CorrelationId", () => {
                const correlationIdHeaderName = "x-correlation-id";
                const testCorrelationId = "test-correlation-id";

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
                    it("/:tenantId?/:id", async () => {
                        await assertCorrelationId(`/documents/${appTenant1.id}/${document1._id}`);
                    });
                    it("/:tenantId/:id/blobs", async () => {
                        await assertCorrelationId(`/documents/${appTenant1.id}`, "post");
                    });
                });

                describe("/deltas", () => {
                    it("/raw/:tenantId?/:id", async () => {
                        await assertCorrelationId(`/deltas/raw/${appTenant1.id}/${document1._id}`);
                    });
                    it("/:tenantId?/:id", async () => {
                        await assertCorrelationId(`/deltas/${appTenant1.id}/${document1._id}`);
                    });
                    it("/v1/:tenantId?/:id", async () => {
                        await assertCorrelationId(`/deltas/v1/${appTenant1.id}/${document1._id}`);
                    });
                    it("/:tenantId?/:id/v1", async () => {
                        await assertCorrelationId(`/deltas/${appTenant1.id}/${document1._id}/v1`);
                    });
                });
            });
        });
    });
});
