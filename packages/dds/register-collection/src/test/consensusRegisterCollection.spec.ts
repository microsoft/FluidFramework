/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IDeltaConnection, IChannelServices } from "@fluidframework/datastore-definitions";
import {
    FileMode,
    ISummaryBlob,
    ITree,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import { IGCTestProvider, runGCTests } from "@fluid-internal/test-dds-utils";
import {
    MockContainerRuntimeFactory,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
    MockFluidDataStoreRuntime,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { ConsensusRegisterCollectionFactory } from "../consensusRegisterCollectionFactory";
import { IConsensusRegisterCollection } from "../interfaces";

describe("ConsensusRegisterCollection", () => {
    const crcFactory = new ConsensusRegisterCollectionFactory();
    describe("Api", () => {
        const dataStoreId = "consensus-register-collection";
        let crc: IConsensusRegisterCollection;
        let dataStoreRuntime: MockFluidDataStoreRuntime;
        let services: IChannelServices;
        let containerRuntimeFactory: MockContainerRuntimeFactory;

        beforeEach(() => {
            dataStoreRuntime = new MockFluidDataStoreRuntime();
            containerRuntimeFactory = new MockContainerRuntimeFactory();
            const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
            services = {
                deltaConnection: containerRuntime.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };

            crc = crcFactory.create(dataStoreRuntime, dataStoreId);
        });

        describe("Attached, connected", () => {
            async function writeAndProcessMsg(key: string, value: any) {
                const waitP = crc.write(key, value);
                containerRuntimeFactory.processAllMessages();
                return waitP;
            }

            beforeEach(() => {
                crc.connect(services);
            });

            it("Can create a collection", () => {
                assert.ok(crc);
            });

            it("Can add and remove data", async () => {
                assert.strictEqual(crc.read("key1"), undefined);
                const writeResult = await writeAndProcessMsg("key1", "val1");
                assert.strictEqual(crc.read("key1"), "val1");
                assert.strictEqual(writeResult, true, "No concurrency expected");
            });

            it("Can add and remove a handle", async () => {
                assert.strictEqual(crc.read("key1"), undefined);
                const handle = crc.handle;
                if (handle === undefined) { assert.fail("Need an actual handle to test this case"); }
                const writeResult = await writeAndProcessMsg("key1", handle);
                const readValue = crc.read("key1");
                assert.strictEqual(readValue.absolutePath, handle.absolutePath);
                assert.strictEqual(writeResult, true, "No concurrency expected");
            });

            it("Change events emit the right key/value", async () => {
                crc.on("atomicChanged", (key: string, value: any, local: boolean) => {
                    assert.strictEqual(key, "key1", "atomicChanged event emitted the wrong key");
                    assert.strictEqual(value, "val1", "atomicChanged event emitted the wrong value");
                });
                crc.on("versionChanged", (key: string, value: any, local: boolean) => {
                    assert.strictEqual(key, "key1", "versionChanged event emitted the wrong key");
                    assert.strictEqual(value, "val1", "versionChanged event emitted the wrong value");
                });
                await writeAndProcessMsg("key1", "val1");
            });
        });

        describe("Summary", () => {
            const snapshotFileName = "header";
            const expectedSerialization = JSON.stringify({
                key1: {
                    atomic: { sequenceNumber: 0, value: { type: "Plain", value: "val1.1" } },
                    versions: [{ sequenceNumber: 0, value: { type: "Plain", value: "val1.1" } }],
                },
            });
            const legacySharedObjectSerialization = JSON.stringify({
                key1: {
                    atomic: { sequenceNumber: 0, value: { type: "Shared", value: "sharedObjId" } },
                    versions: [{ sequenceNumber: 0, value: { type: "Shared", value: "sharedObjId" } }],
                },
            });
            const buildTree = (serialized: string) => ({
                entries: [
                    {
                        mode: FileMode.File,
                        path: snapshotFileName,
                        type: TreeEntry.Blob,
                        value: {
                            contents: serialized,
                            encoding: "utf-8",
                        },
                    },
                ],
                // eslint-disable-next-line no-null/no-null
                id: null,
            });

            it("summarize", async () => {
                await crc.write("key1", "val1.1");
                const summaryTree = crc.summarize().summary;
                assert(Object.keys(summaryTree.tree).length === 1, "summarize should return a tree with single blob");
                const serialized = (summaryTree.tree.header as ISummaryBlob)?.content as string;
                assert(serialized, "summarize should return a tree with blob with contents");
                assert.strictEqual(serialized, expectedSerialization);
            });

            it("load", async () => {
                const tree: ITree = buildTree(expectedSerialization);
                services.objectStorage = new MockStorage(tree);
                const loadedCrc = await crcFactory.load(
                    dataStoreRuntime,
                    dataStoreId,
                    services,
                    ConsensusRegisterCollectionFactory.Attributes,
                );
                assert.strictEqual(loadedCrc.read("key1"), "val1.1");
            });

            it("load with SharedObject not supported", async () => {
                const tree: ITree = buildTree(legacySharedObjectSerialization);
                services.objectStorage = new MockStorage(tree);
                await assert.rejects(crcFactory.load(
                    dataStoreRuntime,
                    dataStoreId,
                    services,
                    ConsensusRegisterCollectionFactory.Attributes,
                ), "SharedObjects contained in ConsensusRegisterCollection can no longer be deserialized");
            });
        });
    });

    describe("Multiple Clients", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
        let containerRuntime1: MockContainerRuntimeForReconnection;
        let containerRuntime2: MockContainerRuntimeForReconnection;
        let dataStoreRuntime1: MockFluidDataStoreRuntime;
        let deltaConnection1: IDeltaConnection;
        let deltaConnection2: IDeltaConnection;
        let testCollection1: IConsensusRegisterCollection;
        let testCollection2: IConsensusRegisterCollection;

        beforeEach(async () => {
            containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

            // Create first ConsensusOrderedCollection
            dataStoreRuntime1 = new MockFluidDataStoreRuntime();
            containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
            deltaConnection1 = containerRuntime1.createDeltaConnection();
            testCollection1 = crcFactory.create(dataStoreRuntime1, "consensus-register-collection1");

            // Create second ConsensusOrderedCollection
            const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
            containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
            deltaConnection2 = containerRuntime2.createDeltaConnection();
            testCollection2 = crcFactory.create(dataStoreRuntime2, "consensus-register-collection2");
        });

        describe("Detached", () => {
            it("should not send ops when the collection is not connected", async () => {
                // Add a listener to the second collection. This is used to verify that the written value reaches
                // the remote client.
                let receivedValue: string = "";
                testCollection2.on("atomicChanged", (key: string, value: string) => {
                    receivedValue = value;
                });

                // Write to the first register collection.
                const testValue = "testValue";
                const writeP = testCollection1.write("key", testValue);

                // Process the messages.
                containerRuntimeFactory.processAllMessages();

                // Verify that the first collection successfully writes and is the winner.
                const winner = await writeP;
                assert.equal(winner, true, "Write was not successful");

                // Verify that the remote client does not get this write because the DDS is not connected.
                assert.equal(receivedValue, "", "The remote client should not have received the write");
            });
        });

        describe("Attached, Connected", () => {
            beforeEach(() => {
                // Connect the collections.
                const services1: IChannelServices = {
                    deltaConnection: deltaConnection1,
                    objectStorage: new MockStorage(),
                };
                const services2: IChannelServices = {
                    deltaConnection: deltaConnection2,
                    objectStorage: new MockStorage(),
                };
                testCollection1.connect(services1);
                testCollection2.connect(services2);
            });

            describe("reconnect", () => {
                const testKey: string = "testKey";
                const testValue: string = "testValue";
                let receivedKey: string = "";
                let receivedValue: string = "";
                let receivedLocalStatus: boolean = true;

                beforeEach(() => {
                    // Add a listener to the second collection. This is used to verify that the written value reaches
                    // the remote client.
                    testCollection2.on("atomicChanged", (key: string, value: string, local: boolean) => {
                        receivedKey = key;
                        receivedValue = value;
                        receivedLocalStatus = local;
                    });
                });

                it("can resend unacked ops on reconnection", async () => {
                    // Write to the first register collection.
                    const writeP = testCollection1.write(testKey, testValue);

                    // Disconnect and reconnect the first collection.
                    containerRuntime1.connected = false;
                    containerRuntime1.connected = true;

                    // Process the messages.
                    containerRuntimeFactory.processAllMessages();

                    // Verify that the first collection successfully writes and is the winner.
                    const winner = await writeP;
                    assert.equal(winner, true, "Write was not successful");

                    // Verify that the remote register collection received the write.
                    assert.equal(receivedKey, testKey, "The remote client did not receive the key");
                    assert.equal(receivedValue, testValue, "The remote client did not receive the value");
                    assert.equal(receivedLocalStatus, false, "The remote client's value should not be local");
                });

                it("can store ops in disconnected state and resend them on reconnection", async () => {
                    // Disconnect the first collection.
                    containerRuntime1.connected = false;

                    // Write to the first register collection.
                    const writeP = testCollection1.write(testKey, testValue);

                    // Reconnect the first collection.
                    containerRuntime1.connected = true;

                    // Process the messages.
                    containerRuntimeFactory.processAllMessages();

                    // Verify that the first collection successfully writes and is the winner.
                    const winner = await writeP;
                    assert.equal(winner, true, "Write was not successful");

                    // Verify that the remote register collection recieved the write.
                    assert.equal(receivedKey, testKey, "The remote client did not receive the key");
                    assert.equal(receivedValue, testValue, "The remote client did not receive the value");
                    assert.equal(receivedLocalStatus, false, "The remote client's value should not be local");
                });

                afterEach(() => {
                    receivedKey = "";
                    receivedValue = "";
                    receivedLocalStatus = true;
                });
            });

            describe("Garbage Collection", () => {
                class GCRegistedCollectionProvider implements IGCTestProvider {
                    private subCollectionCount = 0;
                    private _expectedRoutes: string[] = [];

                    private async writeAndProcessMsg(key: string, value: any) {
                        const waitP = testCollection1.write(key, value);
                        containerRuntimeFactory.processAllMessages();
                        return waitP;
                    }

                    constructor() {
                        this.subCollectionCount = 0;
                        this._expectedRoutes = [];
                    }

                    public get sharedObject() {
                        // Return the remote collection because we want to verify its summary data.
                        return testCollection2;
                    }

                    public get expectedOutboundRoutes() {
                        return this._expectedRoutes;
                    }

                    public async addOutboundRoutes() {
                        const subCollectionId = `subCollection-${++this.subCollectionCount}`;
                        const subTestCollection = crcFactory.create(dataStoreRuntime1, subCollectionId);
                        await this.writeAndProcessMsg(subCollectionId, subTestCollection.handle);
                        this._expectedRoutes.push(subTestCollection.handle.absolutePath);
                    }

                    public async deleteOutboundRoutes() {
                        const subCollectionId = `subCollection-${this.subCollectionCount}`;
                        const deletedHandle = testCollection1.read(subCollectionId) as IFluidHandle;
                        assert(deletedHandle, "Route must be added before deleting");

                        // Delete the last handle that was added.
                        await this.writeAndProcessMsg(subCollectionId, "nonHandleValue");
                        // Remove deleted handle's route from expected routes.
                        this._expectedRoutes =
                            this._expectedRoutes.filter((route) => route !== deletedHandle.absolutePath);
                    }

                    public async addNestedHandles() {
                        const subCollectionId1 = `subCollection-${++this.subCollectionCount}`;
                        const subCollectionId2 = `subCollection-${++this.subCollectionCount}`;
                        const subTestCollection1 = crcFactory.create(dataStoreRuntime1, subCollectionId1);
                        const subTestCollection2 = crcFactory.create(dataStoreRuntime1, subCollectionId2);
                        const containingObject = {
                            collection1Handle: subTestCollection1.handle,
                            nestedObj: {
                                collection2Handle: subTestCollection2.handle,
                            },
                        };
                        await this.writeAndProcessMsg(subCollectionId2, containingObject);
                        this._expectedRoutes.push(
                            subTestCollection1.handle.absolutePath,
                            subTestCollection2.handle.absolutePath);
                    }
                }

                runGCTests(GCRegistedCollectionProvider);
            });
        });
    });
});
