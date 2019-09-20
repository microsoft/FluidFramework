/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@microsoft/fluid-container-definitions";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import * as assert from "assert";
import { ConsensusRegisterCollectionFactory } from "../consensusRegisterCollectionFactory";
import { IConsensusRegisterCollection, IConsensusRegisterCollectionFactory } from "../interfaces";

describe("Routerlicious", () => {
    describe("Api", () => {
        // tslint:disable:mocha-no-side-effect-code
        generate("ConsensusRegisterCollection", new ConsensusRegisterCollectionFactory());
        function generate(
            name: string,
            factory: IConsensusRegisterCollectionFactory) {

            describe(name, () => {
                let testCollection: IConsensusRegisterCollection;
                let runtime: MockRuntime;

                beforeEach(async () => {
                    runtime = new MockRuntime();
                    testCollection = factory.create(runtime, "consensus-register-collection");
                });

                it("Can create a collection", () => {
                    assert.ok(testCollection);
                });
            });
        }
    });

    describe("reconnect", () => {
        it("message sent before reconnect", async () => {
            const factory = new ConsensusRegisterCollectionFactory();
            const runtime = new MockRuntime();
            const deltaConnFactory = new MockDeltaConnectionFactory();
            const deltaConnection = deltaConnFactory.createDeltaConnection(runtime);
            runtime.services = {
                deltaConnection,
                objectStorage: new MockStorage(),
            };
            const testCollection = factory.create(runtime, "consensus-ordered-collection");
            testCollection.connect(runtime.services);

            const writeP = testCollection.write("test", "test");
            deltaConnection.state = ConnectionState.Disconnected;
            deltaConnection.state = ConnectionState.Connecting;
            deltaConnFactory.processAllMessages();
            deltaConnection.state = ConnectionState.Connected;
            deltaConnFactory.processAllMessages();
            await writeP;
        });

        it("message not sent before reconnect", async () => {
            const factory = new ConsensusRegisterCollectionFactory();
            const runtime = new MockRuntime();
            const deltaConnFactory = new MockDeltaConnectionFactory();
            const deltaConnection = deltaConnFactory.createDeltaConnection(runtime);
            runtime.services = {
                deltaConnection,
                objectStorage: new MockStorage(),
            };
            const testCollection = factory.create(runtime, "consensus-ordered-collection");
            testCollection.connect(runtime.services);

            const writeP =  testCollection.write("test", "test");
            deltaConnection.state = ConnectionState.Disconnected;
            deltaConnection.state = ConnectionState.Connecting;
            deltaConnFactory.clearMessages();
            deltaConnection.state = ConnectionState.Connected;
            deltaConnFactory.processAllMessages();
            try {
                await writeP;
                assert.fail("expected to fail");
            } catch { }
        });
    });
});
