/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { ICollection, IDb } from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import rimrafCallback from "rimraf";
import { getDbFactory } from "../services";

const rimraf = util.promisify(rimrafCallback);

/**
 * Test database document
 */
interface ITestDocument {
    documentId: string;
    tenantId: string;
}

/**
 * Test delta
 */
interface ITestDelta {
    documentId: string;
    tenantId: string;
    operation: {
        sequenceNumber: number;
    };
}

/**
 * DB factory test configuration
 */
interface ITestConfig {
    // config.json values used as part of the test
    value: {
        db: {
            inMemory: boolean;
            path?: string;
        };
    };

    // dispose method to allow the config to do any cleanup - i.e. delete the temporary
    // directory used by leveldb
    dispose: () => Promise<void>;
}

/**
 * Factory to create per database configurations for the tests
 */
interface IConfigFactory {
    name: string;
    create: () => ITestConfig;
}

/**
 * Helper function to create a test document to store in the DB
 */
function createTestDocument(
    tenantId: string,
    documentId: string,
): ITestDocument {
    return {
        documentId,
        tenantId,
    };
}

/**
 * Helper function to create a test delta to store in the DB
 */
function createTestDelta(
    tenantId: string,
    documentId: string,
    sequenceNumber: number,
): ITestDelta {
    return {
        tenantId,
        documentId,
        operation: {
            sequenceNumber,
        },
    };
}

describe("Tinylicious", () => {
    describe("Services", () => {
        const configFactories = new Array<IConfigFactory>(
            {
                name: "inMemoryCollection",
                create: () => ({
                    value: {
                        db: {
                            inMemory: true,
                        },
                    },
                    dispose: async () => { },
                }),
            },
            {
                name: "levelDb",
                create: () => {
                    const levelDir = fs.mkdtempSync(path.join(os.tmpdir(), "level-"));

                    return {
                        value: {
                            db: {
                                inMemory: false,
                                path: levelDir,
                            },
                        },
                        dispose: async () => {
                            await rimraf(levelDir);
                        },
                    };
                },
            });

        for (const configFactory of configFactories) {
            describe(configFactory.name, () => {
                const testTenantId = "test";
                const testDocumentId = "document";

                let config: ITestConfig;
                let db: IDb;

                beforeEach(async () => {
                    config = configFactory.create();
                    const provider = new Provider().defaults(config.value);
                    const dbFactory = await getDbFactory(provider);

                    db = await dbFactory.connect(false);
                });

                afterEach(async () => {
                    await db.close();
                    await config.dispose();
                });

                describe("documents", () => {
                    let c: ICollection<ITestDocument>;

                    beforeEach(async () => {
                        c = db.collection<ITestDocument>("documents");
                    });

                    it("findAll - empty", async () => {
                        assert.deepStrictEqual(await c.findAll(), []);
                    });

                    it("findAll - nonempty", async () => {
                        const obj1 = createTestDocument(testTenantId, "document1");
                        const obj2 = createTestDocument(testTenantId, "document2");
                        await c.insertOne(obj1);
                        await c.insertOne(obj2);
                        assert.deepStrictEqual(await c.findAll(), [obj1, obj2]);
                    });

                    it("findOne - missing", async () => {
                        const obj = createTestDocument(testTenantId, testDocumentId);
                        await c.insertOne(obj);
                        assert.deepStrictEqual(
                            await c.findOne({ tenantId: testTenantId, documentId: "missing" }),
                            null);
                    });

                    it("findOne - present", async () => {
                        const obj = createTestDocument(testTenantId, testDocumentId);
                        await c.insertOne(obj);
                        const found = await c.findOne({ tenantId: testTenantId, documentId: testDocumentId });

                        assert.deepStrictEqual(found, obj);
                    });
                });

                describe("deltas", () => {
                    let c: ICollection<ITestDelta>;

                    beforeEach(async () => {
                        c = db.collection<ITestDelta>("deltas");
                    });

                    it("find/findOne - with range query", async () => {
                        const obj = createTestDelta(testTenantId, testDocumentId, 5);

                        await c.insertOne(obj);

                        const queries = [
                            {
                                "tenantId": testTenantId,
                                "documentId": testDocumentId,
                                "operation.sequenceNumber": 5,
                            },
                            {
                                "tenantId": testTenantId,
                                "documentId": testDocumentId,
                                "operation.sequenceNumber": { $gt: 4 },
                            },
                            {
                                "tenantId": testTenantId,
                                "documentId": testDocumentId,
                                "operation.sequenceNumber": { $lt: 6 },
                            },
                        ];

                        for (const query of queries) {
                            assert.deepStrictEqual(await c.find(query, {}), [obj]);
                            assert.deepStrictEqual(await c.findOne(query), obj);
                        }
                    });

                    it("find/findOne - multiple documents", async () => {
                        const first = createTestDelta(testTenantId, testDocumentId, 1);
                        const second = createTestDelta(testTenantId, testDocumentId, 2);

                        await c.insertOne(first);
                        await c.insertOne(second);

                        const query = { tenantId: testTenantId, documentId: testDocumentId };

                        assert.deepStrictEqual(await c.find(query, {}), [first, second]);
                        assert.deepStrictEqual(await c.findOne(query), first);
                    });

                    it("find - with sort", async () => {
                        const obj10 = createTestDelta(testTenantId, testDocumentId, 10);
                        const obj15 = createTestDelta(testTenantId, testDocumentId, 15);

                        await c.insertOne(obj10);
                        await c.insertOne(obj15);

                        const query = {
                            "tenantId": testTenantId,
                            "documentId": testDocumentId,
                            "operation.sequenceNumber": { $gt: 4 },
                        };

                        assert.deepStrictEqual(
                            await c.find(query, { "operation.sequenceNumber": 1 }),
                            [obj10, obj15],
                        );
                    });
                });
            });
        }
    });
});
