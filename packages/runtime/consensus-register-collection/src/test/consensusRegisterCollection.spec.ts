/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    FileMode,
    IBlob,
    ITree,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@fluidframework/test-runtime-utils";
import { IDeltaConnection } from "@fluidframework/component-runtime-definitions";
import { strongAssert } from "@fluidframework/runtime-utils";
import { ConsensusRegisterCollectionFactory } from "../consensusRegisterCollectionFactory";
import { IConsensusRegisterCollection } from "../interfaces";

describe("ConsensusRegisterCollection", () => {
    const crcFactory = new ConsensusRegisterCollectionFactory();
    describe("Api", () => {
        const componentId = "consensus-register-collection";
        let crc: IConsensusRegisterCollection;
        let runtime: MockRuntime;
        let deltaConnFactory: MockDeltaConnectionFactory;
        let deltaConnection: IDeltaConnection;

        beforeEach(() => {
            runtime = new MockRuntime();
            deltaConnFactory = new MockDeltaConnectionFactory();
            deltaConnection = deltaConnFactory.createDeltaConnection(runtime);
            runtime.services = {
                deltaConnection,
                objectStorage: new MockStorage(),
            };
            // Make the runtime non-local so that ops are submitted to the DeltaConnection.
            runtime.local = false;
            crc = crcFactory.create(runtime, componentId);
        });

        describe("Attached, connected", () => {
            async function writeAndProcessMsg(k, v) {
                const waitP = crc.write(k, v);
                deltaConnFactory.processAllMessages();
                return waitP;
            }

            beforeEach(() => {
                crc.connect(runtime.services);
                deltaConnection.connected = true;
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
                assert.strictEqual(readValue.path, handle.path);
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
    });

    describe("Summary", () => {
        const snapshotFileName = "header";
        const componentId = "consensus-register-collection";
        let crc: IConsensusRegisterCollection;
        let runtime: MockRuntime;
        let deltaConnFactory: MockDeltaConnectionFactory;
        let deltaConnection: IDeltaConnection;

        const expectedSerialization = JSON.stringify({
            key1:{
                atomic:{ sequenceNumber:0,value:{ type:"Plain",value:"val1.1" } },
                versions:[{ sequenceNumber:0,value:{ type:"Plain",value:"val1.1" } }],
            },
        });
        const legacySharedObjectSerialization = JSON.stringify({
            key1:{
                atomic:{ sequenceNumber:0,value:{ type:"Shared",value:"sharedObjId" } },
                versions:[{ sequenceNumber:0,value:{ type:"Shared",value:"sharedObjId" } }],
            },
        });
        const buildTree = (serialized: string) => ({
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: serialized,
                        encoding: "utf-8",
                    },
                },
            ],
            // eslint-disable-next-line no-null/no-null
            id: null,
        });

        beforeEach(() => {
            runtime = new MockRuntime();
            deltaConnFactory = new MockDeltaConnectionFactory();
            deltaConnection = deltaConnFactory.createDeltaConnection(runtime);
            runtime.services = {
                deltaConnection,
                objectStorage: new MockStorage(),
            };
            // Make the runtime non-local so that ops are submitted to the DeltaConnection.
            runtime.local = false;
            crc = crcFactory.create(runtime, componentId);
        });

        it("snapshot", async () => {
            await crc.write("key1", "val1.1");
            const tree: ITree = crc.snapshot();
            assert(tree.entries.length === 1, "snapshot should return a tree with blob");
            const serialized: string = (tree.entries[0]?.value as IBlob)?.contents;
            strongAssert(serialized, "snapshot should return a tree with blob with contents");
            assert.strictEqual(serialized, expectedSerialization);
        });

        it("load", async () => {
            const tree: ITree = buildTree(expectedSerialization);
            runtime.services.objectStorage = new MockStorage(tree);
            const loadedCrc = await crcFactory.load(
                runtime,
                componentId,
                runtime.services,
                "master",
                ConsensusRegisterCollectionFactory.Attributes,
            );
            assert.strictEqual(loadedCrc.read("key1"), "val1.1");
        });

        it("load with SharedObject not supported", async () => {
            const tree: ITree = buildTree(legacySharedObjectSerialization);
            runtime.services.objectStorage = new MockStorage(tree);
            await assert.rejects(crcFactory.load(
                runtime,
                componentId,
                runtime.services,
                "master",
                ConsensusRegisterCollectionFactory.Attributes,
            ), "SharedObjects contained in ConsensusRegisterCollection can no longer be deserialized");
        });
    });

    describe("Multiple Clients", () => {
        let deltaConnectionFactory: MockDeltaConnectionFactory;
        let runtime1: MockRuntime;
        let runtime2: MockRuntime;
        let deltaConnection1: IDeltaConnection;
        let deltaConnection2: IDeltaConnection;
        let testCollection1: IConsensusRegisterCollection;
        let testCollection2: IConsensusRegisterCollection;

        // Creates a ConsensusRegisterCollection but does not connect it.
        async function createConsensusRegisterCollection(
            id: string,
            runtime: MockRuntime,
            deltaConnection: IDeltaConnection,
        ): Promise<IConsensusRegisterCollection> {
            runtime.services = {
                deltaConnection,
                objectStorage: new MockStorage(),
            };
            runtime.attach();
            // Make the runtime non-local so that ops are submitted to the DeltaConnection.
            runtime.local = false;

            const consensusRegisterCollection = crcFactory.create(runtime, id);
            return consensusRegisterCollection;
        }

        beforeEach(async () => {
            deltaConnectionFactory = new MockDeltaConnectionFactory();

            // Create first ConsensusOrderedCollection
            runtime1 = new MockRuntime();
            deltaConnection1 = deltaConnectionFactory.createDeltaConnection(runtime1);
            testCollection1 =
                await createConsensusRegisterCollection("consenses-register-collection1", runtime1, deltaConnection1);

            // Create second ConsensusOrderedCollection
            runtime2 = new MockRuntime();
            deltaConnection2 = deltaConnectionFactory.createDeltaConnection(runtime2);
            testCollection2 =
                await createConsensusRegisterCollection("consenses-register-collection2", runtime2, deltaConnection2);
        });

        describe("Object not connected", () => {
            it("should not send ops when DDS is not connected", async () => {
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
                deltaConnectionFactory.processAllMessages();

                // Verify that the first collection successfully writes and is the winner.
                const winner = await writeP;
                assert.equal(winner, true, "Write was not successful");

                // Verify that the remote client does not get this write because the DDS is not connected.
                assert.equal(receivedValue, "", "The remote client should not have received the write");
            });
        });

        describe("reconnect", () => {
            const testKey: string = "testKey";
            const testValue: string = "testValue";
            let receivedKey: string = "";
            let receivedValue: string = "";
            let receivedLocalStatus: boolean = true;

            beforeEach(() => {
                // Connect the collections.
                testCollection1.connect(runtime1.services);
                testCollection2.connect(runtime2.services);

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

                // Disconnect and reconnect the connection for the first register collection.
                deltaConnection1.connected = false;
                deltaConnectionFactory.clearMessages();
                deltaConnection1.connected = true;

                // Process the messages.
                deltaConnectionFactory.processAllMessages();

                // Verify that the first collection successfully writes and is the winner.
                const winner = await writeP;
                assert.equal(winner, true, "Write was not successful");

                // Verify that the remote regsiter collection recieved the write.
                assert.equal(receivedKey, testKey, "The remote client did not receive the key");
                assert.equal(receivedValue, testValue, "The remote client did not receive the value");
                assert.equal(receivedLocalStatus, false, "The remote client's value should not be local");
            });

            it("can store ops in disconnected state and resend them on reconnection", async () => {
                // Disconnect the connection for the first register collection.
                deltaConnection1.connected = false;

                // Write to the first register collection.
                const writeP = testCollection1.write(testKey, testValue);

                // Reconnect the first register collection.
                deltaConnection1.connected = true;

                // Process the messages.
                deltaConnectionFactory.processAllMessages();

                // Verify that the first collection successfully writes and is the winner.
                const winner = await writeP;
                assert.equal(winner, true, "Write was not successful");

                // Verify that the remote regsiter collection recieved the write.
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
    });
});
