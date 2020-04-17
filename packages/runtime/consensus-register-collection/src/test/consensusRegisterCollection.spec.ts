/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ConnectionState } from "@microsoft/fluid-protocol-definitions";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import { IDeltaConnection } from "@microsoft/fluid-runtime-definitions";
import { ConsensusRegisterCollectionFactory } from "../consensusRegisterCollectionFactory";
import { IConsensusRegisterCollection, IConsensusRegisterCollectionFactory } from "../interfaces";

describe("Routerlicious", () => {
    describe("Api", () => {
        // tslint:disable:mocha-no-side-effect-code
        function generate(
            name: string,
            factory: IConsensusRegisterCollectionFactory) {
            let testCollection: IConsensusRegisterCollection;
            let runtime: MockRuntime;

            describe(name, () => {
                beforeEach(async () => {
                    runtime = new MockRuntime();
                    testCollection = factory.create(runtime, "consensus-register-collection");
                });

                it("Can create a collection", () => {
                    assert.ok(testCollection);
                });
            });
        }
        generate("ConsensusRegisterCollection", new ConsensusRegisterCollectionFactory());
    });

    describe("reconnect", () => {
        let testCollection: IConsensusRegisterCollection;
        let runtime: MockRuntime;
        let deltaConnFactory: MockDeltaConnectionFactory;
        let deltaConnection: IDeltaConnection;

        beforeEach(async () => {
            const factory = new ConsensusRegisterCollectionFactory();
            runtime = new MockRuntime();
            deltaConnFactory = new MockDeltaConnectionFactory();
            deltaConnection = deltaConnFactory.createDeltaConnection(runtime);
            runtime.services = {
                deltaConnection,
                objectStorage: new MockStorage(),
            };
            testCollection = factory.create(runtime, "consensus-register-collection");
        });

        it("message not sent before attach", async () => {
            const writeP =  testCollection.write("test", "test");
            const res = await writeP;
            assert(res);
        });

        it("message not sent before connect", async () => {
            testCollection.connect(runtime.services);

            deltaConnection.state = ConnectionState.Disconnected;
            const writeP =  testCollection.write("test", "test");
            deltaConnection.state = ConnectionState.Connected;
            deltaConnFactory.processAllMessages();
            const res = await writeP;
            assert(res);
        });

        it("message sent before reconnect", async () => {
            testCollection.connect(runtime.services);

            const writeP = testCollection.write("test", "test");
            deltaConnection.state = ConnectionState.Disconnected;
            deltaConnection.state = ConnectionState.Connecting;
            deltaConnFactory.processAllMessages();
            deltaConnection.state = ConnectionState.Connected;
            deltaConnFactory.processAllMessages();
            const res = await writeP;
            assert(res);
        });

        it("message not sent before reconnect", async () => {
            testCollection.connect(runtime.services);

            const writeP =  testCollection.write("test", "test");
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
