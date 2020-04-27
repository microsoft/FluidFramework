/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import {
    FileMode,
    IBlob,
    ITree,
    ConnectionState,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import { IDeltaConnection } from "@microsoft/fluid-runtime-definitions";
import { strongAssert } from "@microsoft/fluid-runtime-utils";
import { ConsensusRegisterCollectionFactory } from "../consensusRegisterCollectionFactory";
import { IConsensusRegisterCollection } from "../interfaces";

describe("ConsensusRegisterCollection", () => {
    const snapshotFileName = "header";
    const componentId = "consensus-register-collection";
    const crcFactory = new ConsensusRegisterCollectionFactory();
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
        crc = crcFactory.create(runtime, componentId);
    });

    describe("Api", () => {
        describe("Attached, connected", () => {
            async function writeAndProcessMsg(k, v) {
                const waitP = crc.write(k, v);
                deltaConnFactory.processAllMessages();
                return waitP;
            }

            beforeEach(() => {
                crc.connect(runtime.services);
                deltaConnection.state = ConnectionState.Connected;
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

    describe("reconnect", () => {
        it("message not sent before attach", async () => {
            const writeP =  crc.write("test", "test");
            const res = await writeP;
            assert(res);
        });

        it("message not sent before connect", async () => {
            crc.connect(runtime.services);

            deltaConnection.state = ConnectionState.Disconnected;
            const writeP =  crc.write("test", "test");
            deltaConnection.state = ConnectionState.Connected;
            deltaConnFactory.processAllMessages();
            const res = await writeP;
            assert(res);
        });

        it("message sent before reconnect", async () => {
            crc.connect(runtime.services);

            const writeP = crc.write("test", "test");
            deltaConnection.state = ConnectionState.Disconnected;
            deltaConnection.state = ConnectionState.Connecting;
            deltaConnFactory.processAllMessages();
            deltaConnection.state = ConnectionState.Connected;
            deltaConnFactory.processAllMessages();
            const res = await writeP;
            assert(res);
        });

        it("message not sent before reconnect", async () => {
            crc.connect(runtime.services);

            const writeP =  crc.write("test", "test");
            deltaConnection.state = ConnectionState.Disconnected;
            deltaConnection.state = ConnectionState.Connecting;
            deltaConnFactory.clearMessages();
            deltaConnection.state = ConnectionState.Connected;
            deltaConnFactory.processAllMessages();
            const res = await writeP;
            assert(res);
        });
    });
});
