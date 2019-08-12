/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockRuntime } from "@prague/runtime-test-utils";
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
});
