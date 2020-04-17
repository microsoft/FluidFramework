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
    let runtime: MockRuntime;
    let deltaConnFactory: MockDeltaConnectionFactory;
    let deltaConnection: IDeltaConnection;

    describe("Api", () => {
        // tslint:disable:mocha-no-side-effect-code
        function generate(
            name: string,
            creator: () => IConsensusRegisterCollection,
            processMessages: () => void,
        ) {
            let crc: IConsensusRegisterCollection;

            async function read(k) {
                const resP = crc.read(k);
                processMessages();
                setImmediate(() => processMessages());
                return resP;
            }

            async function write(k, v) {
                const waitP = crc.write(k, v);
                processMessages();
                return waitP;
            }

            describe(name, () => {
                beforeEach(async () => {
                    crc = creator();
                });

                it("Can create a collection", () => {
                    assert.ok(crc);
                });

                it("Can add and remove data", async () => {
                    assert.strictEqual(await read("key1"), undefined);
                    await write("key1", "val1");
                    assert.strictEqual(await read("key1"), "val1");
                });

                it("Can add and remove a handle", async () => {
                    assert.strictEqual(await read("key1"), undefined);
                    const handle = crc.handle;
                    if (handle === undefined) { assert.fail("Need an actual handle to test this case"); }
                    await write("key1", handle);
                    const acquiredValue = await read("key1");
                    assert.strictEqual(acquiredValue.path, handle.path);
                });
            });
        }

        describe("Attached, connected", () => {
            generate(
                "ConsensusRegisterCollection",
                () => {
                    const crcFactory = new ConsensusRegisterCollectionFactory();
                    runtime = new MockRuntime();
                    deltaConnFactory = new MockDeltaConnectionFactory();
                    deltaConnection = deltaConnFactory.createDeltaConnection(runtime);
                    runtime.services = {
                        deltaConnection,
                        objectStorage: new MockStorage(),
                    };
                    const crc = crcFactory.create(runtime, "consensus-register-collection");
                    crc.connect(runtime.services);
                    deltaConnection.state = ConnectionState.Connected;
                    return crc;
                },
                () => {
                    deltaConnFactory.processAllMessages();
                },
            );
        });
    });

    // describe("reconnect", () => {
    //     it("message not sent before attach", async () => {
    //         const writeP =  crc.write("test", "test");
    //         const res = await writeP;
    //         assert(res);
    //     });

    //     it("message not sent before connect", async () => {
    //         crc.connect(runtime.services);

    //         deltaConnection.state = ConnectionState.Disconnected;
    //         const writeP =  crc.write("test", "test");
    //         deltaConnection.state = ConnectionState.Connected;
    //         deltaConnFactory.processAllMessages();
    //         const res = await writeP;
    //         assert(res);
    //     });

    //     it("message sent before reconnect", async () => {
    //         crc.connect(runtime.services);

    //         const writeP = crc.write("test", "test");
    //         deltaConnection.state = ConnectionState.Disconnected;
    //         deltaConnection.state = ConnectionState.Connecting;
    //         deltaConnFactory.processAllMessages();
    //         deltaConnection.state = ConnectionState.Connected;
    //         deltaConnFactory.processAllMessages();
    //         const res = await writeP;
    //         assert(res);
    //     });

    //     it("message not sent before reconnect", async () => {
    //         crc.connect(runtime.services);

    //         const writeP =  crc.write("test", "test");
    //         deltaConnection.state = ConnectionState.Disconnected;
    //         deltaConnection.state = ConnectionState.Connecting;
    //         deltaConnFactory.clearMessages();
    //         deltaConnection.state = ConnectionState.Connected;
    //         deltaConnFactory.processAllMessages();
    //         const res = await writeP;
    //         assert(res);
    //     });
    // });
});
