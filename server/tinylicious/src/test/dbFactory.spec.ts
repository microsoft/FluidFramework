/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ICollection, IDb } from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import { DbFactory } from "../services";

/**
 * JSON value stored within the database collections used in the test
 */
interface IValue {
    _id?: number;
    foo?: string;
    a?: {
        b: number;
    }
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
        }
    }

    // dispose method to allow the config to do any cleanup - i.e. delete the temporary
    // directory used by leveldb
    dispose: () => void;
}

/**
 * Factory to create per database configurations for the tests
 */
interface IConfigFactory {
    name: string;
    create: () => ITestConfig;
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
                    dispose: () => { },
                }),
            },
            {
                name: "levelDb",
                create: () => {
                    const levelDir = fs.mkdtempSync(path.join(os.tmpdir(), "level-"));

                    return {
                        value: {
                            db: {
                                inMemory: true,
                                path: levelDir,
                            },
                        },
                        dispose: () => {
                            fs.rmdirSync(levelDir);
                        },
                    };
                },
            });

        for (const configFactory of configFactories) {
            describe(configFactory.name, () => {
                describe("find API", () => {
                    let config: ITestConfig;
                    let db: IDb;
                    let c: ICollection<IValue>;

                    beforeEach(async () => {
                        config = configFactory.create();
                        const provider = new Provider().defaults(config.value);
                        const dbFactory = new DbFactory(provider);

                        db = await dbFactory.connect();
                        c = db.collection<IValue>("test");
                    });

                    afterEach(async () => {
                        await db.close();
                        config.dispose();
                    });

                    it("findAll - empty", async () => {
                        assert.deepStrictEqual(await c.findAll(), []);
                    });

                    it("findAll - nonempty", async () => {
                        const obj1 = { _id: 1, foo: "FOO" };
                        const obj2 = { _id: 2, foo: "FOO" };
                        await c.insertOne(obj1);
                        await c.insertOne(obj2);
                        assert.deepStrictEqual(await c.findAll(), [obj1, obj2]);
                    });

                    it("find/findOne - missing", async () => {
                        const obj = { _id: 1, foo: "FOO" };
                        await c.insertOne(obj);
                        assert.deepStrictEqual(await c.find({ a: 2 }, {}), []);
                        assert.deepStrictEqual(await c.findOne({ _id: 2 }), null);
                    });

                    it("findOne - _id present", async () => {
                        const obj = { _id: 1, foo: "FOO" };
                        await c.insertOne(obj);
                        assert.deepStrictEqual(await c.findOne({ _id: 1 }), obj);
                    });

                    it("find/findOne - using getValueByKey", async () => {
                        const obj = { a: { b: 5 } };
                        await c.insertOne(obj);
                        assert.deepStrictEqual(await c.find({ "a.b": 5 }, {}), [obj]);
                        assert.deepStrictEqual(await c.find({ "a.b": { $gt: 4 } }, {}), [obj]);
                        assert.deepStrictEqual(await c.find({ "a.b": { $lt: 6 } }, {}), [obj]);
                        assert.deepStrictEqual(await c.findOne({ "a.b": 5 }), obj);
                        assert.deepStrictEqual(await c.findOne({ "a.b": { $gt: 4 } }), obj);
                        assert.deepStrictEqual(await c.findOne({ "a.b": { $lt: 6 } }), obj);
                    });

                    it("find/findOne - multiple matches", async () => {
                        const obj15 = { a: { b: 15 } };
                        const obj10 = { a: { b: 10 } };
                        await c.insertOne(obj15);
                        await c.insertOne(obj10);
                        assert.deepStrictEqual(await c.find({ "a.b": { $gt: 4 } }, {}), [obj15, obj10]);
                        assert.deepStrictEqual(await c.findOne({ "a.b": { $gt: 4 } }), obj15);
                    });

                    it("find - with sort", async () => {
                        const obj15 = { a: { b: 15 } };
                        const obj10 = { a: { b: 10 } };
                        await c.insertOne(obj15);
                        await c.insertOne(obj10);
                        assert.deepStrictEqual(
                            await c.find({ "a.b": { $gt: 4 } }, { "a.b": 1 }),
                            [obj10, obj15],
                        );
                        assert.deepStrictEqual(
                            await c.find({ "a.b": { $gt: 4 } }, { "a.b": -1 }),
                            [obj15, obj10],
                        );
                    });
                });
            });
        }
    });
});
