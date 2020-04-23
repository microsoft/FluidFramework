/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ConnectionState } from "@microsoft/fluid-protocol-definitions";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import { IDeltaConnection } from "@microsoft/fluid-runtime-definitions";
import { ConsensusRegisterCollectionFactory } from "../consensusRegisterCollectionFactory";
import { IConsensusRegisterCollection } from "../interfaces";

describe("ConsensusRegisterCollection", () => {
    let crc: IConsensusRegisterCollection;
    let runtime: MockRuntime;
    let deltaConnFactory: MockDeltaConnectionFactory;
    let deltaConnection: IDeltaConnection;

    describe("Api", () => {
        describe("Attached, connected", () => {
            async function write(k, v) {
                const waitP = crc.write(k, v);
                deltaConnFactory.processAllMessages();
                return waitP;
            }

            beforeEach(() => {
                const crcFactory = new ConsensusRegisterCollectionFactory();
                runtime = new MockRuntime();
                deltaConnFactory = new MockDeltaConnectionFactory();
                deltaConnection = deltaConnFactory.createDeltaConnection(runtime);
                runtime.services = {
                    deltaConnection,
                    objectStorage: new MockStorage(),
                };
                crc = crcFactory.create(runtime, "consensus-register-collection");
                crc.connect(runtime.services);
                deltaConnection.state = ConnectionState.Connected;
            });

            it("Can create a collection", () => {
                assert.ok(crc);
            });

            it("Can add and remove data", async () => {
                assert.strictEqual(crc.read("key1"), undefined);
                const writeResult = await write("key1", "val1");
                assert.strictEqual(crc.read("key1"), "val1");
                assert.strictEqual(writeResult, true, "No concurrency expected");
            });

            it("Can add and remove a handle", async () => {
                assert.strictEqual(crc.read("key1"), undefined);
                const handle = crc.handle;
                if (handle === undefined) { assert.fail("Need an actual handle to test this case"); }
                const writeResult = await write("key1", handle);
                const readValue = crc.read("key1");
                assert.strictEqual(readValue.path, handle.path);
                assert.strictEqual(writeResult, true, "No concurrency expected");
            });
        });
    });

    describe("reconnect", () => {
        beforeEach(() => {
            const crcFactory = new ConsensusRegisterCollectionFactory();
            runtime = new MockRuntime();
            deltaConnFactory = new MockDeltaConnectionFactory();
            deltaConnection = deltaConnFactory.createDeltaConnection(runtime);
            runtime.services = {
                deltaConnection,
                objectStorage: new MockStorage(),
            };
            crc = crcFactory.create(runtime, "consensus-register-collection");
        });

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
